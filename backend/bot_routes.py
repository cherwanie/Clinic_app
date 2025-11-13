from flask import Blueprint, request, jsonify
import mysql.connector
import re
from datetime import datetime, timedelta

INTENT_KEYWORDS = {
    "suggest_slots": [
        # ถามเวลาว่าง/คิวว่างของหมอ
        "เวลาว่างหมอ", "คิวว่างหมอ", "หมอว่างตอนไหน", "หมอว่างเมื่อไหร่",
        "หมอว่างวันไหน", "ดูเวลาว่างหมอ", "มีคิวหมอว่างไหม", "คิวหมอว่างไหม",
        "ขอเวลาว่างหมอ", "หาคิวหมอ", "เช็กคิวหมอว่าง", "เช็คนัดหมอว่าง",
        "ดูตารางหมอ", "ดูตารางออกตรวจ", "ตารางออกตรวจหมอ",
        "มีคิวว่างไหม", "มีเวลาว่างไหม", "ช่องว่างในตาราง", "ช่วงเวลาว่าง",
    ],
    "check_appointment": [
        # ตรวจสอบนัด / ดูคิว
        "เช็กนัด", "เช็คนัด", "เช็คคิวนัด", "เช็กคิว", "เช็คคิว", "ดูคิวนัด",
        "ดูคิววันนี้", "ดูคิวพรุ่งนี้", "ดูนัดวันนี้", "ดูนัดพรุ่งนี้",
        "ตรวจสอบนัด", "ตรวจนัด", "เช็คว่ามีคิวนัดไหม", "มีนัดไหม",
        "วันนี้มีนัดอะไรบ้าง", "วันนี้หมอมีนัดอะไรบ้าง",
        "คิวนัดของคนไข้", "ประวัตินัดหมาย", "ดูตารางนัด",
    ],
    "patient_summary": [
        # สรุป/ดูประวัติคนไข้
        "ประวัติคนไข้", "ดูประวัติคนไข้", "สรุปคนไข้", "สรุปข้อมูลคนไข้",
        "สรุปประวัติ", "ดูข้อมูลผู้ป่วย", "ดูข้อมูลคนไข้", "profile คนไข้",
        "รายละเอียดคนไข้", "ดึงข้อมูลคนไข้", "ประวัติการรักษา",
        "ประวัติรักษา", "เคยรักษาอะไรบ้าง", "เคยมาหาหมอเรื่องอะไรบ้าง",
        "การรักษาล่าสุด", "มารักษาล่าสุดเมื่อไหร่",
    ]
}

def detect_intent(message: str):
    """
    เดาเจตนาจากข้อความภาษาไทย
    คืนค่า: "suggest_slots" / "check_appointment" / "patient_summary" / None
    """
    if not message:
        return None

    msg = message.strip().lower()

    for intent, keywords in INTENT_KEYWORDS.items():
        for kw in keywords:
            if kw in msg:
                return intent

    return None


def extract_entities(message: str):
    """ดึงเลขหมอ, เลขคนไข้, วันที่ จากประโยคภาษาไทยแบบง่าย ๆ"""
    entities = {}
    msg = message.lower()

    m = re.search(r"คนไข้\s*(\d+)", msg)
    if m:
        entities["patient_id"] = int(m.group(1))

    m = re.search(r"(หมอ|แพทย์)(หมายเลข)?\s*(\d+)", msg)
    if m:
        entities["doctor_id"] = int(m.group(3))

    m = re.search(r"วันที่\s*(\d+)", msg)
    today = datetime.today()
    if m:
        day = int(m.group(1))
        try:
            entities["date"] = today.replace(day=day).strftime("%Y-%m-%d")
        except ValueError:
            pass

    if "วันนี้" in msg:
        entities["date"] = today.strftime("%Y-%m-%d")
    elif "พรุ่งนี้" in msg:
        entities["date"] = (today + timedelta(days=1)).strftime("%Y-%m-%d")

    return entities

# Blueprint + DB

bot_bp = Blueprint("bot", __name__)

def get_db():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="root",
        database="clinic_db",
        charset="utf8mb4"
    )
# CORE ฟังก์ชันที่คุยกับ DB

def _suggest_slots_core(doctor_id, date_str):
    """
    คำนวณช่วงเวลาว่างของแพทย์ในวันที่กำหนด
    คืนค่า: { "ok": True, "available_slots": ["09:00", "09:15", ...] }
    """
    db = get_db()
    cur = db.cursor(dictionary=True)

    cur.execute("""
        SELECT TIME(appointment_time) AS t
        FROM appointment
        WHERE doctor_id = %s
          AND DATE(appointment_time) = %s
          AND status IN ('scheduled','rescheduled')
    """, (doctor_id, date_str))
    busy_times = {row["t"].strftime("%H:%M") for row in cur.fetchall()}

    slots = []
    start = datetime.strptime(date_str + " 09:00", "%Y-%m-%d %H:%M")
    end   = datetime.strptime(date_str + " 17:00", "%Y-%m-%d %H:%M")

    current = start
    while current <= end:
        t_str = current.strftime("%H:%M")
        if t_str not in busy_times:
            slots.append(t_str)
        current += timedelta(minutes=15)

    cur.close()
    db.close()

    return {"ok": True, "available_slots": slots}


def _patient_summary_core(patient_id: int):
    """
    ดึงข้อมูลคนไข้ + ประวัติการรักษาล่าสุด 5 รายการ
    """
    db = get_db()
    cur = db.cursor(dictionary=True)

    cur.execute("SELECT * FROM patient WHERE patient_id = %s", (patient_id,))
    patient = cur.fetchone()
    if patient is None:
        cur.close()
        db.close()
        return {"ok": False, "patient": None, "recent_treatments": []}

    cur.execute("""
        SELECT t.treatment_date, t.diagnosis, t.advice
        FROM treatment t
        WHERE t.patient_id = %s
        ORDER BY t.treatment_date DESC
        LIMIT 5
    """, (patient_id,))
    history = cur.fetchall()

    cur.close()
    db.close()

    return {"ok": True, "patient": patient, "recent_treatments": history}

# ROUTES
@bot_bp.route("/api/bot/ping", methods=["GET"])
def ping():
    return jsonify({"ok": True, "message": "bot is alive"})


@bot_bp.route("/api/bot/validate_appointment", methods=["POST"])
def validate_appointment():
    data = request.get_json(force=True, silent=True) or {}

    patient_id = data.get("patient_id")
    doctor_id = data.get("doctor_id")
    appointment_time = data.get("appointment_time")

    errors = []

    if not patient_id:
        errors.append("กรุณาระบุรหัสผู้ป่วย")
    if not doctor_id:
        errors.append("กรุณาเลือกแพทย์")
    if not appointment_time:
        errors.append("กรุณาเลือกวันและเวลานัดหมาย")

    if errors:
        return jsonify({"ok": False, "errors": errors}), 400

    db = get_db()
    cur = db.cursor(dictionary=True)

    cur.execute("SELECT patient_id FROM patient WHERE patient_id = %s", (patient_id,))
    if cur.fetchone() is None:
        errors.append("ไม่พบข้อมูลผู้ป่วยในระบบ")

    cur.execute("SELECT doctor_id FROM doctor WHERE doctor_id = %s", (doctor_id,))
    doctor = cur.fetchone()
    if doctor is None:
        errors.append("ไม่พบข้อมูลแพทย์ในระบบ")

    if not errors:
        cur.execute("""
            SELECT appointment_id
            FROM appointment
            WHERE doctor_id = %s
              AND appointment_time BETWEEN DATE_SUB(%s, INTERVAL 15 MINUTE)
                                      AND DATE_ADD(%s, INTERVAL 15 MINUTE)
              AND status IN ('scheduled','rescheduled')
        """, (doctor_id, appointment_time, appointment_time))
        conflict = cur.fetchone()
        if conflict:
            errors.append("ช่วงเวลาดังกล่าวมีนัดของแพทย์ท่านนี้อยู่แล้ว กรุณาเลือกเวลาอื่นที่ห่างอย่างน้อย 15 นาที")

    cur.close()
    db.close()

    if errors:
        return jsonify({"ok": False, "errors": errors}), 400

    return jsonify({"ok": True, "message": "ข้อมูลการนัดหมายผ่านการตรวจสอบ สามารถบันทึกได้"}), 200


@bot_bp.route("/api/bot/suggest_slots", methods=["POST"])
def suggest_slots():
    data = request.get_json(force=True, silent=True) or {}
    doctor_id = data.get("doctor_id")
    date = data.get("date")

    if not doctor_id or not date:
        return jsonify({"ok": False, "errors": ["กรุณาเลือกแพทย์และวันที่"]}), 400

    result = _suggest_slots_core(doctor_id, date)

    return jsonify({
        "ok": True,
        "doctor_id": doctor_id,
        "date": date,
        "available_slots": result["available_slots"]
    }), 200


@bot_bp.route("/api/bot/patient_summary", methods=["GET"])
def patient_summary():
    patient_id = request.args.get("patient_id")

    if not patient_id:
        return jsonify({"ok": False, "errors": ["กรุณาระบุรหัสผู้ป่วย"]}), 400

    result = _patient_summary_core(patient_id)

    if not result["ok"]:
        return jsonify({"ok": False, "errors": ["ไม่พบข้อมูลผู้ป่วย"]}), 404

    return jsonify({
        "ok": True,
        "patient": result["patient"],
        "recent_treatments": result["recent_treatments"]
    }), 200


@bot_bp.route("/api/bot/chat", methods=["POST"])
def chat():
    data = request.get_json(force=True, silent=True) or {}
    message = (data.get("message") or "").strip()

    if not message:
        return jsonify({"ok": False, "reply": "พิมพ์ข้อความมาก่อนนะครับ"}), 400

    intent = detect_intent(message)
    entities = extract_entities(message)

    if intent is None:
        return jsonify({
            "ok": False,
            "reply": "ตอนนี้ผมยังไม่เข้าใจคำสั่งนี้ ลองใช้คำว่า เช็กนัด / เวลาว่างหมอ / ประวัติคนไข้ ดูนะครับ"
        }), 200

    # intent: เวลาว่างหมอ
    if intent == "suggest_slots":
        doctor_id = entities.get("doctor_id")
        date = entities.get("date")

        if not doctor_id or not date:
            return jsonify({
                "ok": False,
                "reply": "ขอเลขหมอและวันที่ด้วยครับ เช่น 'ดูเวลาว่างหมอ 1 วันที่ 15'"
            }), 200

        resp = _suggest_slots_core(doctor_id, date)
        times = resp["available_slots"][:5]

        if not times:
            text = f"วันที่ {date} หมอ {doctor_id} คิวเต็มแล้วครับ"
        else:
            text = f"วันที่ {date} หมอ {doctor_id} มีเวลาว่างเช่น {', '.join(times)} ครับ"

        return jsonify({"ok": True, "reply": text}), 200

    # intent: สรุปประวัติคนไข้
    if intent == "patient_summary":
        patient_id = entities.get("patient_id")
        if not patient_id:
            return jsonify({
                "ok": False,
                "reply": "ขอรหัสคนไข้ด้วยครับ เช่น 'ดูประวัติคนไข้ 5'"
            }), 200

        resp = _patient_summary_core(patient_id)
        if not resp["ok"]:
            return jsonify({"ok": False, "reply": "ไม่พบข้อมูลผู้ป่วยครับ"}), 200

        history = resp["recent_treatments"]
        if not history:
            text = f"คนไข้รหัส {patient_id} ยังไม่มีประวัติการรักษาในระบบครับ"
        else:
            last = history[0]
            text = (
                f"คนไข้รหัส {patient_id} มารักษาล่าสุดวันที่ {last['treatment_date']} "
                f"วินิจฉัยว่า {last['diagnosis']} คำแนะนำ: {last['advice']}"
            )

        return jsonify({"ok": True, "reply": text}), 200

    if intent == "check_appointment":
        return jsonify({
            "ok": True,
            "reply": "ตอนนี้ยังไม่รองรับการเช็กนัดแบบประโยคอิสระเต็ม ๆ นะครับ แนะนำใช้ฟอร์มหน้าจัดการนัดหมาย แล้วกดให้บอทตรวจสอบแทนครับ"
        }), 200

    return jsonify({"ok": False, "reply": "ยังไม่รองรับคำสั่งนี้ครับ"}), 200
