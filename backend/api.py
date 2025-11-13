from flask import Flask, request, jsonify
from bot_routes import bot_bp
from flask_cors import CORS
import mysql.connector
from datetime import date

app = Flask(__name__)
app.register_blueprint(bot_bp)
CORS(app) 

try:
    mydb = mysql.connector.connect(
        host="localhost",
        user="root",
        password="root",
        database="clinic_db",
        autocommit=True,             
        charset="utf8mb4",
        use_pure=True
    )
    print(">>> เชื่อมต่อฐานข้อมูล MySQL สำเร็จ")
except Exception as e:
    print(f">>> เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล: {e}")
    mydb = None


def get_cursor():
    """คืน cursor แบบ dictionary=True สำหรับแต่ละคำขอ"""
    if not mydb:
        return None
    return mydb.cursor(dictionary=True)

@app.route('/login', methods=['POST'])
def login():
    cur = get_cursor()
    if not cur:
        return jsonify({'status': 'error', 'message': 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้'}), 500

    try:
        data = request.get_json(silent=True) or {}
        username = (data.get('username') or '').strip()
        password = data.get('password') or ''
        if not username or not password:
            cur.close()
            return jsonify({'status': 'error', 'message': 'กรุณากรอกข้อมูลให้ครบถ้วน'}), 400

        # ----- ตรวจในตาราง doctor (แบบง่าย: ตรวจสอบ password ตรงๆ) -----
        cur.execute("""
            SELECT
                doctor_id AS id,
                CONCAT_WS(' ', first_name, last_name) AS name,
                username,
                password
            FROM doctor
            WHERE username = %s AND password = %s
            LIMIT 1
        """, (username, password))
        doc = cur.fetchone()
        if doc:
            doc.pop('password', None)
            cur.close()
            return jsonify({'status': 'success', 'role': 'doctor', 'user': doc}), 200

        # ----- ตรวจในตาราง employee (แบบง่าย: ตรวจสอบ password ตรงๆ) -----
        cur.execute("""
            SELECT
                employee_id AS id,
                CONCAT_WS(' ', first_name, last_name) AS name,
                username,
                password,
                position
            FROM employee
            WHERE username = %s AND password = %s
            LIMIT 1
        """, (username, password))
        emp = cur.fetchone()
        cur.close()

        if emp:
            role = 'owner' if (emp.get('position') == 'owner') else 'staff'
            emp.pop('password', None)
            return jsonify({'status': 'success', 'role': role, 'user': emp}), 200

        return jsonify({'status': 'error', 'message': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'}), 401

    except Exception as e:
        try:
            cur.close()
        except Exception:
            pass
        print("Error during login:", e)
        return jsonify({'status': 'error', 'message': 'เกิดข้อผิดพลาดภายในระบบ'}), 500

@app.get("/patients")
def list_patients():
    cur = get_cursor()
    if not cur:
        return jsonify({'status':'error','message':'DB error'}), 500

    q = (request.args.get("q") or "").strip()
    cur.execute("""
      SELECT 
        p.patient_id AS id,
        CONCAT_WS(' ', p.first_name, p.last_name) AS name,
        CONCAT('HN', LPAD(p.patient_id,3,'0')) AS hn,
        TIMESTAMPDIFF(YEAR, p.birth_date, CURDATE()) AS age,
        p.phone AS tel,
        COALESCE(DATE_FORMAT(MAX(t.treatment_date),'%Y-%m-%d'), '') AS lastVisit
      FROM patient p
      LEFT JOIN treatment t ON t.patient_id = p.patient_id
      WHERE (%s = '' 
           OR p.first_name LIKE CONCAT('%',%s,'%') 
           OR p.last_name  LIKE CONCAT('%',%s,'%')
           OR CONCAT('HN', LPAD(p.patient_id,3,'0')) LIKE CONCAT('%',%s,'%')
           OR p.phone LIKE CONCAT('%',%s,'%'))
      GROUP BY p.patient_id
      ORDER BY p.patient_id DESC
    """, (q, q, q, q, q))
    rows = cur.fetchall()
    cur.close()
    return jsonify({'status':'success','data':rows}), 200

@app.route("/patients/<int:pid>/records", methods=["GET"])
def patient_records(pid):
    cur = get_cursor()
    if not cur:
        return jsonify({'status':'error','message':'DB error'}), 500

    cur.execute("""
      SELECT 
        t.treatment_id AS id,
        DATE_FORMAT(t.treatment_date,'%Y-%m-%d') AS date,
        t.diagnosis,
        t.advice AS treatment,
        CONCAT_WS(' ', d.first_name, d.last_name) AS doctor
      FROM treatment t
      JOIN doctor d ON d.doctor_id = t.doctor_id
      WHERE t.patient_id = %s
      ORDER BY t.treatment_date DESC, t.treatment_id DESC
    """, (pid,))
    rows = cur.fetchall()
    cur.close()
    return jsonify({'status':'success','data':rows}), 200


@app.post("/treatments")
def create_treatment():
    """
    หมอกดบันทึกการรักษา:
      - ใช้ appointment_id จาก front
      - ดึง patient_id / doctor_id จาก appointment
      - สร้าง treatment
      - set appointment.status = 'completed'
      - ถ้ายังไม่มี payment -+ สร้าง payment = unpaid
    """
    cur = get_cursor()
    if not cur:
        return jsonify({'status': 'error', 'message': 'DB connection error'}), 500

    data = request.get_json(silent=True) or {}

    appointment_id = data.get('appointment_id')
    symptom       = (data.get('symptom') or '').strip()
    diagnosis     = (data.get('diagnosis') or '').strip()
    advice        = (data.get('advice') or '').strip()

    # ต้องมี appointment_id + diagnosis + advice อย่างน้อย
    if not appointment_id or not diagnosis or not advice:
        cur.close()
        return jsonify({
            'status': 'error',
            'message': 'ต้องส่ง appointment_id, diagnosis, advice มาครบ'
        }), 400

    try:
        appointment_id = int(appointment_id)
    except Exception:
        cur.close()
        return jsonify({
            'status': 'error',
            'message': 'appointment_id ต้องเป็นตัวเลข'
        }), 400

    try:
        # 1) ดึงข้อมูลใบนัดจาก appointment
        cur.execute("""
            SELECT
              appointment_id,
              patient_id,
              doctor_id,
              status
            FROM appointment
            WHERE appointment_id = %s
            LIMIT 1
        """, (appointment_id,))
        appt = cur.fetchone()

        if not appt:
            cur.close()
            return jsonify({
                'status': 'error',
                'message': 'ไม่พบใบนัดนี้ในระบบ'
            }), 404

        patient_id = appt["patient_id"]
        doctor_id  = appt["doctor_id"]

        # 2) เช็คว่ามี treatment ของใบนัดนี้อยู่แล้วหรือยัง
        cur.execute("""
            SELECT treatment_id
            FROM treatment
            WHERE appointment_id = %s
            LIMIT 1
        """, (appointment_id,))
        existing = cur.fetchone()
        if existing:
            cur.close()
            return jsonify({
                'status': 'error',
                'message': 'ใบนัดนี้มีการบันทึกการรักษาแล้ว',
                'treatment_id': existing["treatment_id"]
            }), 400

        # 3) สร้าง treatment ใหม่
        cur.execute("""
            INSERT INTO treatment (
                patient_id,
                doctor_id,
                appointment_id,
                symptom,
                diagnosis,
                advice,
                treatment_date
            ) VALUES (
                %s, %s, %s,
                %s, %s, %s,
                %s
            )
        """, (
            patient_id,
            doctor_id,
            appointment_id,
            symptom,
            diagnosis,
            advice,
            date.today()
        ))
        treatment_id = cur.lastrowid

        # 4) อัปเดตสถานะนัดเป็น completed
        cur.execute("""
            UPDATE appointment
            SET status = 'completed'
            WHERE appointment_id = %s
        """, (appointment_id,))

        # 5) ถ้ายังไม่มี payment ของใบนัดนี้ → สร้างใหม่ status = unpaid
        cur.execute("""
            SELECT payment_id
            FROM payment
            WHERE appointment_id = %s
            LIMIT 1
        """, (appointment_id,))
        pay = cur.fetchone()

        if not pay:
            cur.execute("""
                INSERT INTO payment (
                    patient_id,
                    appointment_id,
                    amount,
                    payment_method,
                    payment_date,
                    status
                ) VALUES (
                    %s, %s,
                    %s, %s, %s, %s
                )
            """, (
                patient_id,
                appointment_id,
                0.00,      # ยังไม่คิดเงิน
                'cash',    # default method; ตอนจ่ายจริงค่อยแก้
                None,
                'unpaid'
            ))
            payment_id = cur.lastrowid
        else:
            payment_id = pay["payment_id"]

        cur.close()
        return jsonify({
            'status': 'success',
            'message': 'บันทึกการรักษาและสร้างข้อมูลชำระเงินเรียบร้อย',
            'data': {
                'treatment_id': treatment_id,
                'appointment_id': appointment_id,
                'payment_id': payment_id
            }
        }), 201

    except Exception as e:
        print("create_treatment error:", e)
        try:
            cur.close()
        except Exception:
            pass
        return jsonify({
            'status': 'error',
            'message': 'เกิดข้อผิดพลาดในการบันทึกการรักษา'
        }), 500
    
@app.get("/payments/unpaid")
def list_unpaid_payments():
    """
    ดึงรายการ payment ที่ status = 'unpaid'
    ใช้สำหรับหน้าพนักงาน (เคาน์เตอร์) เวลาดูคิวที่ต้องจ่ายเงิน
    """
    cur = get_cursor()
    if not cur:
        return jsonify({'status': 'error', 'message': 'DB connection error'}), 500

    try:
        cur.execute("""
            SELECT
              pay.payment_id,
              pay.amount,
              pay.status,
              a.appointment_id,
              a.appointment_date,
              a.appointment_time,
              p.patient_id,
              CONCAT_WS(' ', p.first_name, p.last_name) AS patient_name
            FROM payment pay
            JOIN appointment a ON a.appointment_id = pay.appointment_id
            JOIN patient p ON p.patient_id = pay.patient_id
            WHERE pay.status = 'unpaid'
            ORDER BY a.appointment_date, a.appointment_time
        """)
        rows = cur.fetchall()
        cur.close()
        return jsonify({'status': 'success', 'data': rows}), 200

    except Exception as e:
        print("list_unpaid_payments error:", e)
        try:
            cur.close()
        except Exception:
            pass
        return jsonify({
            'status': 'error',
            'message': 'ไม่สามารถดึงข้อมูลรายการค้างชำระได้'
        }), 500

@app.put("/payments/<int:payment_id>/pay")
def pay_payment(payment_id):
    """
    อัปเดต payment ตอนจ่ายเงินจริง:
      - set amount
      - set payment_method
      - set payment_date = วันนี้
      - set status = 'paid'
    """
    cur = get_cursor()
    if not cur:
        return jsonify({'status': 'error', 'message': 'DB connection error'}), 500

    data = request.get_json(silent=True) or {}
    amount = data.get('amount')
    method = (data.get('payment_method') or 'cash').strip()  # cash / credit / transfer

    # validate
    try:
        amount = float(amount)
    except Exception:
        cur.close()
        return jsonify({
            'status': 'error',
            'message': 'amount ต้องเป็นตัวเลข'
        }), 400

    if amount <= 0:
        cur.close()
        return jsonify({
            'status': 'error',
            'message': 'amount ต้องมากกว่า 0'
        }), 400

    if method not in ('cash', 'credit', 'transfer'):
        cur.close()
        return jsonify({
            'status': 'error',
            'message': 'payment_method ต้องเป็น cash / credit / transfer'
        }), 400

    try:
        # เช็คว่ามี payment นี้จริงไหม
        cur.execute("""
            SELECT payment_id
            FROM payment
            WHERE payment_id = %s
            LIMIT 1
        """, (payment_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            return jsonify({
                'status': 'error',
                'message': 'ไม่พบรายการชำระเงินนี้'
            }), 404

        # อัปเดตเป็นจ่ายแล้ว
        cur.execute("""
            UPDATE payment
            SET amount = %s,
                payment_method = %s,
                payment_date = CURDATE(),
                status = 'paid'
            WHERE payment_id = %s
        """, (amount, method, payment_id))

        cur.close()
        return jsonify({
            'status': 'success',
            'message': 'บันทึกการชำระเงินเรียบร้อย'
        }), 200

    except Exception as e:
        print("pay_payment error:", e)
        try:
            cur.close()
        except Exception:
            pass
        return jsonify({
            'status': 'error',
            'message': 'ไม่สามารถบันทึกการชำระเงินได้'
        }), 500


# APPOINTMENT APIs
@app.route("/appointments", methods=["GET"])
def list_appointments():
    """
    ดึงรายการนัด:
      - รองรับ ?date=2025-11-13
      - รองรับ ?doctor_id=1
      - รองรับ ?status=scheduled
    """
    cur = get_cursor()
    if not cur:
        return jsonify({'status': 'error', 'message': 'DB connection error'}), 500

    date_str   = (request.args.get("date") or "").strip()
    doctor_id  = (request.args.get("doctor_id") or "").strip()
    status     = (request.args.get("status") or "").strip()

    where_clauses = []
    params = []

    if date_str:
        where_clauses.append("a.appointment_date = %s")
        params.append(date_str)

    if doctor_id:
        try:
            doctor_id_int = int(doctor_id)
            where_clauses.append("a.doctor_id = %s")
            params.append(doctor_id_int)
        except Exception:
            cur.close()
            return jsonify({
                'status': 'error',
                'message': 'doctor_id ต้องเป็นตัวเลข'
            }), 400

    if status:
        where_clauses.append("a.status = %s")
        params.append(status)

    where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

    try:
        cur.execute(f"""
            SELECT
              a.appointment_id AS id,
              DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS date,
              TIME_FORMAT(a.appointment_time, '%H:%i') AS time,
              a.status,
              p.patient_id,
              CONCAT_WS(' ', p.first_name, p.last_name) AS patient_name,
              d.doctor_id,
              CONCAT_WS(' ', d.first_name, d.last_name) AS doctor_name
            FROM appointment a
            JOIN patient p ON p.patient_id = a.patient_id
            JOIN doctor  d ON d.doctor_id  = a.doctor_id
            {where_sql}
            ORDER BY a.appointment_date, a.appointment_time
        """, tuple(params))
        rows = cur.fetchall()
        cur.close()
        return jsonify({'status': 'success', 'data': rows}), 200

    except Exception as e:
        print("list_appointments error:", e)
        try:
            cur.close()
        except Exception:
            pass
        return jsonify({'status': 'error', 'message': 'ไม่สามารถดึงข้อมูลงานนัดหมายได้'}), 500


@app.route("/appointments", methods=["POST"])
def create_appointment():
    """
    สร้างใบนัดใหม่ (จองคิว / walk-in):
      ต้องส่ง patient_id, doctor_id, appointment_date, appointment_time
      - ตรวจระยะห่างคิวหมอคนเดียวกันอย่างน้อย 15 นาที
    """
    cur = get_cursor()
    if not cur:
        return jsonify({'status': 'error', 'message': 'DB connection error'}), 500

    data = request.get_json(silent=True) or {}

    patient_id       = data.get("patient_id")
    doctor_id        = data.get("doctor_id")
    appointment_date = (data.get("appointment_date") or "").strip()   # 'YYYY-MM-DD'
    appointment_time = (data.get("appointment_time") or "").strip()   # 'HH:MM'
    status           = (data.get("status") or "scheduled").strip()    # default scheduled

    if not patient_id or not doctor_id or not appointment_date or not appointment_time:
        cur.close()
        return jsonify({
            'status': 'error',
            'message': 'ต้องส่ง patient_id, doctor_id, appointment_date, appointment_time ให้ครบ'
        }), 400

    try:
        patient_id = int(patient_id)
        doctor_id  = int(doctor_id)
    except Exception:
        cur.close()
        return jsonify({
            'status': 'error',
            'message': 'patient_id และ doctor_id ต้องเป็นตัวเลข'
        }), 400

    # ตรวจว่า status ถูกต้องตาม enum ที่เราใช้
    allowed_status = ('scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled')
    if status not in allowed_status:
        cur.close()
        return jsonify({
            'status': 'error',
            'message': f"status ต้องเป็นหนึ่งใน {allowed_status}"
        }), 400

    try:
        # 1) เช็คว่ามีคิวชนในช่วง 15 นาทีของหมอคนนี้หรือยัง
        cur.execute("""
            SELECT
              appointment_id,
              appointment_time
            FROM appointment
            WHERE doctor_id = %s
              AND appointment_date = %s
              AND status IN ('scheduled','rescheduled')
              AND ABS(TIMESTAMPDIFF(MINUTE, appointment_time, %s)) < 15
            LIMIT 1
        """, (doctor_id, appointment_date, appointment_time))
        clash = cur.fetchone()
        if clash:
            cur.close()
            return jsonify({
                'status': 'error',
                'message': 'มีคิวของหมอคนนี้ในช่วงเวลาใกล้กันแล้ว (ต้องห่างอย่างน้อย 15 นาที)'
            }), 400

        # 2) แทรกใบนัดใหม่
        cur.execute("""
            INSERT INTO appointment (
                patient_id,
                doctor_id,
                appointment_date,
                appointment_time,
                status
            ) VALUES (
                %s, %s, %s, %s, %s
            )
        """, (patient_id, doctor_id, appointment_date, appointment_time, status))

        new_id = cur.lastrowid
        cur.close()

        return jsonify({
            'status': 'success',
            'message': 'สร้างใบนัดสำเร็จ',
            'data': {
                'appointment_id': new_id,
                'patient_id': patient_id,
                'doctor_id': doctor_id,
                'appointment_date': appointment_date,
                'appointment_time': appointment_time,
                'status': status
            }
        }), 201

    except Exception as e:
        print("create_appointment error:", e)
        try:
            cur.close()
        except Exception:
            pass
        return jsonify({'status': 'error', 'message': 'ไม่สามารถสร้างใบนัดได้'}), 500


@app.route("/appointments/<int:appointment_id>", methods=["PUT"])
def update_appointment(appointment_id):
    """
    แก้ไขใบนัด:
      ส่ง field ที่อยากแก้มา เช่น
      {
        "appointment_date": "2025-11-20",
        "appointment_time": "10:30",
        "doctor_id": 2,
        "status": "rescheduled"
      }
    """
    cur = get_cursor()
    if not cur:
        return jsonify({'status': 'error', 'message': 'DB connection error'}), 500

    data = request.get_json(silent=True) or {}

    fields = []
    params = []

    appointment_date = data.get("appointment_date")
    appointment_time = data.get("appointment_time")
    doctor_id        = data.get("doctor_id")
    status           = data.get("status")

    if appointment_date:
        fields.append("appointment_date = %s")
        params.append(appointment_date)

    if appointment_time:
        fields.append("appointment_time = %s")
        params.append(appointment_time)

    if doctor_id is not None:
        try:
            doctor_id_int = int(doctor_id)
        except Exception:
            cur.close()
            return jsonify({
                'status': 'error',
                'message': 'doctor_id ต้องเป็นตัวเลข'
            }), 400
        fields.append("doctor_id = %s")
        params.append(doctor_id_int)

    if status:
        allowed_status = ('scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled')
        if status not in allowed_status:
            cur.close()
            return jsonify({
                'status': 'error',
                'message': f"status ต้องเป็นหนึ่งใน {allowed_status}"
            }), 400
        fields.append("status = %s")
        params.append(status)

    if not fields:
        cur.close()
        return jsonify({
            'status': 'error',
            'message': 'ไม่มีข้อมูลให้แก้ไข'
        }), 400

    params.append(appointment_id)

    try:
        cur.execute("""
            SELECT appointment_id
            FROM appointment
            WHERE appointment_id = %s
            LIMIT 1
        """, (appointment_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            return jsonify({
                'status': 'error',
                'message': 'ไม่พบใบนัดนี้'
            }), 404

        # ถ้าแก้วันที่/เวลา/หมอ → ตรวจชนคิว 15 นาทีอีกที
        if appointment_date or appointment_time or doctor_id is not None:
            # ดึงค่าใหม่ที่จะใช้เช็ค (ถ้าไม่ส่งมา ใช้ค่าปัจจุบัน)
            cur.execute("""
                SELECT
                  doctor_id,
                  appointment_date,
                  appointment_time,
                  status
                FROM appointment
                WHERE appointment_id = %s
            """, (appointment_id,))
            current = cur.fetchone()
            if not current:
                cur.close()
                return jsonify({
                    'status': 'error',
                    'message': 'ไม่พบใบนัดนี้'
                }), 404

            new_doctor_id  = int(doctor_id) if doctor_id is not None else current["doctor_id"]
            new_date       = appointment_date or str(current["appointment_date"])
            new_time       = appointment_time or str(current["appointment_time"])

            # เช็คชนคิว
            cur.execute("""
                SELECT
                  appointment_id
                FROM appointment
                WHERE doctor_id = %s
                  AND appointment_date = %s
                  AND status IN ('scheduled','rescheduled')
                  AND ABS(TIMESTAMPDIFF(MINUTE, appointment_time, %s)) < 15
                  AND appointment_id <> %s
                LIMIT 1
            """, (new_doctor_id, new_date, new_time, appointment_id))
            clash = cur.fetchone()
            if clash:
                cur.close()
                return jsonify({
                    'status': 'error',
                    'message': 'มีคิวของหมอคนนี้ในช่วงเวลาใกล้กันแล้ว (ต้องห่างอย่างน้อย 15 นาที)'
                }), 400

        # อัปเดตจริง
        sql = f"""
            UPDATE appointment
            SET {", ".join(fields)}
            WHERE appointment_id = %s
        """
        cur.execute(sql, tuple(params))
        cur.close()

        return jsonify({
            'status': 'success',
            'message': 'อัปเดตใบนัดเรียบร้อย'
        }), 200

    except Exception as e:
        print("update_appointment error:", e)
        try:
            cur.close()
        except Exception:
            pass
        return jsonify({'status': 'error', 'message': 'ไม่สามารถอัปเดตใบนัดได้'}), 500


@app.route("/appointments/<int:appointment_id>/cancel", methods=["PUT"])
def cancel_appointment(appointment_id):
    """
    ยกเลิกใบนัด → status = 'cancelled'
    """
    cur = get_cursor()
    if not cur:
        return jsonify({'status': 'error', 'message': 'DB connection error'}), 500

    try:
        cur.execute("""
            UPDATE appointment
            SET status = 'cancelled'
            WHERE appointment_id = %s
        """, (appointment_id,))
        if cur.rowcount == 0:
            cur.close()
            return jsonify({
                'status': 'error',
                'message': 'ไม่พบใบนัดนี้'
            }), 404

        cur.close()
        return jsonify({
            'status': 'success',
            'message': 'ยกเลิกใบนัดเรียบร้อย'
        }), 200

    except Exception as e:
        print("cancel_appointment error:", e)
        try:
            cur.close()
        except Exception:
            pass
        return jsonify({'status': 'error', 'message': 'ไม่สามารถยกเลิกใบนัดได้'}), 500


@app.route("/appointments/<int:appointment_id>/no-show", methods=["PUT"])
def mark_no_show(appointment_id):
    """
    กรณีคนไข้ไม่มาตามนัด → status = 'no_show'
    """
    cur = get_cursor()
    if not cur:
        return jsonify({'status': 'error', 'message': 'DB connection error'}), 500

    try:
        cur.execute("""
            UPDATE appointment
            SET status = 'no_show'
            WHERE appointment_id = %s
        """, (appointment_id,))
        if cur.rowcount == 0:
            cur.close()
            return jsonify({
                'status': 'error',
                'message': 'ไม่พบใบนัดนี้'
            }), 404

        cur.close()
        return jsonify({
            'status': 'success',
            'message': 'บันทึกว่าไม่มาตามนัดเรียบร้อย'
        }), 200

    except Exception as e:
        print("mark_no_show error:", e)
        try:
            cur.close()
        except Exception:
            pass
        return jsonify({'status': 'error', 'message': 'ไม่สามารถบันทึก no_show ได้'}), 500


if __name__ == '__main__':
    print(">>> Flask Back-end Server กำลังจะเริ่มทำงาน")
    
    app.run(debug=True, host="127.0.0.1", port=5000)