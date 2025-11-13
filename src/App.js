import React, { useState, useEffect } from 'react';
import { User, FileText, Calendar, DollarSign, Users, Activity, ClipboardList, Printer, LogOut, Lock, Search } from 'lucide-react';

const API = 'http://127.0.0.1:5000';

/* --------------------------- Login --------------------------- */
const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showAccounts, setShowAccounts] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        onLogin({ ...data.user, role: data.role });
      } else {
        setError(data.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      }
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ Back-end ได้');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="bg-indigo-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Activity className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">ระบบบริหารคลินิก</h1>
          <p className="text-gray-600">เข้าสู่ระบบ</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ชื่อผู้ใช้</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="text-gray-400" size={20} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="กรอกชื่อผู้ใช้"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">รหัสผ่าน</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="text-gray-400" size={20} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="กรอกรหัสผ่าน"
                required
              />
            </div>
          </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition-colors font-semibold shadow-lg">
            เข้าสู่ระบบ
          </button>
        </form>

        <div className="mt-6 text-center">
          <button onClick={() => setShowAccounts(!showAccounts)} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
            {showAccounts ? 'ซ่อนบัญชีทดสอบ' : 'ดูบัญชีทดสอบ'}
          </button>
        </div>

        {showAccounts && (
          <div className="mt-4 bg-gray-50 rounded-lg p-4 text-sm">
            <p className="font-bold text-gray-700 mb-2">บัญชีทดสอบ (รหัสผ่าน 1234 ทั้งหมด)</p>
            <div className="space-y-2">
              <div className="bg-blue-50 p-2 rounded">
                <p className="font-semibold text-blue-700">แพทย์:</p>
                <p className="text-gray-700">doctor1, doctor2</p>
              </div>
              <div className="bg-green-50 p-2 rounded">
                <p className="font-semibold text-green-700">พนักงาน:</p>
                <p className="text-gray-700">staff1, staff2</p>
              </div>
              <div className="bg-purple-50 p-2 rounded">
                <p className="font-semibold text-purple-700">เจ้าของ:</p>
                <p className="text-gray-700">owner</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* --------------------------- Doctor --------------------------- */
const DoctorDashboard = ({ onLogout, userData }) => {
  const [activeTab, setActiveTab] = useState('records');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Patients
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [patientsError, setPatientsError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/patients`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'โหลดรายชื่อผู้ป่วยไม่สำเร็จ');
        setPatients(json.data || []);
      } catch (err) {
        setPatientsError(err.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
      } finally {
        setLoadingPatients(false);
      }
    };
    load();
  }, []);

  // Records (fetch-on-demand + cache)
  const [recordsByPatient, setRecordsByPatient] = useState({});
  const [loadingRecordsId, setLoadingRecordsId] = useState(null);
  const [recordsErrorByPatient, setRecordsErrorByPatient] = useState({});

  const loadRecords = async (pid) => {
    if (recordsByPatient[pid]) return;
    try {
      setRecordsErrorByPatient((x) => ({ ...x, [pid]: '' }));
      setLoadingRecordsId(pid);
      const res = await fetch(`${API}/patients/${pid}/records`);
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.message || 'โหลดเวชระเบียนไม่สำเร็จ');
      setRecordsByPatient((prev) => ({ ...prev, [pid]: json.data || [] }));
    } catch (err) {
      setRecordsErrorByPatient((x) => ({ ...x, [pid]: err.message || 'เกิดข้อผิดพลาด' }));
    } finally {
      setLoadingRecordsId(null);
    }
  };

  // mock sections (ยังไม่เชื่อม DB)
  const [labResults, setLabResults] = useState([
    { id: 1, patientId: 1, patientName: 'สมชาย ใจดี', date: '2025-10-15', testType: 'ตรวจเลือด', result: 'ปกติ', wbc: 7200, rbc: 4.8, hb: 13.5, platelet: 250000 },
    { id: 2, patientId: 2, patientName: 'สมหญิง รักสุข', date: '2025-10-16', testType: 'ปัสสาวะ', result: 'รอผล', wbc: '-', rbc: '-', hb: '-', platelet: '-' },
  ]);
  const [referrals] = useState([
    { id: 1, patientId: 1, patientName: 'สมชาย ใจดี', date: '2025-10-10', hospital: 'โรงพยาบาลกลาง', reason: 'สงสัยโรคหัวใจ', status: 'รอติดตาม', doctor: userData.name },
  ]);

  const [formData, setFormData] = useState({
    treatmentPatient: '',
    treatmentSymptoms: '',
    treatmentDiagnosis: '',
    treatmentPlan: '',
    certPatient: '',
    certType: 'ใบรับรองแพทย์ทั่วไป',
    certDetails: '',
    certStartDate: '',
    certEndDate: '',
    labPatient: '',
    labTestType: 'ตรวจเลือด',
    labResult: '',
  });

  const handleFormChange = (field, value) => setFormData((p) => ({ ...p, [field]: value }));

  // mock add treatment (ยังไม่บันทึก DB)
  const [medicalRecords, setMedicalRecords] = useState([]);
  const handleAddTreatment = (e) => {
    e.preventDefault();
    if (!formData.treatmentPatient || !formData.treatmentDiagnosis || !formData.treatmentPlan) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน'); return;
    }
    const patient = patients.find((p) => p.id === parseInt(formData.treatmentPatient, 10));
    const newRecord = {
      id: medicalRecords.length + 1,
      patientId: patient.id,
      patientName: patient.name,
      date: new Date().toISOString().split('T')[0],
      diagnosis: formData.treatmentDiagnosis,
      treatment: formData.treatmentPlan,
      doctor: userData.name,
    };
    setMedicalRecords([...medicalRecords, newRecord]);
    setFormData({ ...formData, treatmentPatient: '', treatmentSymptoms: '', treatmentDiagnosis: '', treatmentPlan: '' });
    alert('บันทึกการรักษาสำเร็จ (ตัวอย่าง)');
  };

  const handleCreateCertificate = (e) => {
    e.preventDefault();
    if (!formData.certPatient || !formData.certDetails) { alert('กรุณากรอกข้อมูลให้ครบถ้วน'); return; }
    alert('ออกใบรับรองแพทย์สำเร็จ (ตัวอย่าง) — ใช้คำสั่งพิมพ์ของเบราว์เซอร์ได้เลย');
  };

  const handleAddLabResult = (e) => {
    e.preventDefault();
    if (!formData.labPatient || !formData.labResult) { alert('กรุณากรอกข้อมูลให้ครบถ้วน'); return; }
    const patient = patients.find((p) => p.id === parseInt(formData.labPatient, 10));
    const newLab = {
      id: labResults.length + 1,
      patientId: patient.id,
      patientName: patient.name,
      date: new Date().toISOString().split('T')[0],
      testType: formData.labTestType,
      result: formData.labResult,
      wbc: 7500, rbc: 4.9, hb: 14.0, platelet: 260000,
    };
    setLabResults([...labResults, newLab]);
    setFormData({ ...formData, labPatient: '', labResult: '' });
    alert('บันทึกผลการตรวจสำเร็จ (ตัวอย่าง)');
  };

  // ค้นหา (กันพังด้วยการแปลง string เสมอ)
  const needle = (searchTerm || '').toLowerCase();
  const filteredPatients = patients.filter((p) => {
    const name = String(p.name || '').toLowerCase();
    const hn = String(p.hn || '').toLowerCase();
    const tel = String(p.tel || '');
    return name.includes(needle) || hn.includes(needle) || tel.includes(searchTerm);
  });

  const shownRecords = selectedPatient ? (recordsByPatient[selectedPatient.id] || []) : [];
  const isLoadingRecords = selectedPatient ? (loadingRecordsId === selectedPatient.id) : false;
  const recordsError = selectedPatient ? (recordsErrorByPatient[selectedPatient.id] || '') : '';

  const filteredLabs = labResults.filter((l) =>
    String(l.patientName || '').toLowerCase().includes(needle) ||
    String(l.testType || '').toLowerCase().includes(needle)
  );

  const tabs = [
    { id: 'records', name: 'เวชระเบียน', icon: FileText },
    { id: 'treatment', name: 'บันทึกการรักษา', icon: ClipboardList },
    { id: 'certificate', name: 'ใบรับรอง', icon: FileText },
    { id: 'lab', name: 'ผลแล็บ', icon: Activity },
    { id: 'referral', name: 'ส่งตัว', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-blue-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <User size={28} />
            <div>
              <h1 className="text-xl font-bold">ระบบแพทย์</h1>
              <p className="text-sm text-blue-100">{userData.name}</p>
            </div>
          </div>
          <button onClick={onLogout} className="bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded-lg flex items-center space-x-2">
            <LogOut size={20} />
            <span>ออกจากระบบ</span>
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setSearchTerm(''); }}
                  className={`px-4 py-3 flex items-center space-x-2 whitespace-nowrap ${
                    activeTab === tab.id ? 'bg-white text-blue-600 rounded-t-lg' : 'text-blue-100 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  <span className="font-medium">{tab.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        {(activeTab === 'records' || activeTab === 'lab') && (
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหา (ชื่อ, HN, เบอร์โทร, การวินิจฉัย)"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {activeTab === 'records' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">เวชระเบียนผู้ป่วย</h2>
            {loadingPatients && <p>กำลังโหลดข้อมูลผู้ป่วย...</p>}
            {patientsError && <p className="text-red-600">{patientsError}</p>}

            <div className="grid gap-4">
              {filteredPatients.map((patient) => (
                <div key={patient.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg text-gray-800">{patient.name}</h3>
                      <p className="text-gray-600">HN: {patient.hn} | อายุ: {patient.age} ปี</p>
                      <p className="text-gray-600">โทร: {patient.tel}</p>
                      <p className="text-sm text-gray-500 mt-2">มาล่าสุด: {patient.lastVisit}</p>
                    </div>
                    <button
                      onClick={async () => {
                        if (selectedPatient?.id === patient.id) { setSelectedPatient(null); return; }
                        await loadRecords(patient.id);
                        setSelectedPatient(patient);
                      }}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                    >
                      {selectedPatient?.id === patient.id ? 'ซ่อน' : 'ดูเวชระเบียน'}
                    </button>
                  </div>

                  {selectedPatient?.id === patient.id && (
                    <div className="mt-4 pt-4 border-t">
                      <h4 className="font-bold mb-2">ประวัติการรักษา</h4>
                      {isLoadingRecords && <p className="text-gray-600">กำลังโหลดเวชระเบียน...</p>}
                      {recordsError && <p className="text-red-600">{recordsError}</p>}
                      {!isLoadingRecords && !recordsError && shownRecords.length === 0 && (
                        <p className="text-gray-600">ยังไม่มีเวชระเบียน</p>
                      )}
                      {shownRecords.map((record) => (
                        <div key={record.id} className="bg-gray-50 p-3 rounded mb-2">
                          <p className="text-sm text-gray-600">{record.date}</p>
                          <p className="font-medium">การวินิจฉัย: {record.diagnosis}</p>
                          <p className="text-sm">การรักษา: {record.treatment}</p>
                          <p className="text-sm text-gray-600">โดย: {record.doctor}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'treatment' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">บันทึกการรักษา</h2>
            <form onSubmit={handleAddTreatment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">เลือกผู้ป่วย *</label>
                <select
                  value={formData.treatmentPatient}
                  onChange={(e) => handleFormChange('treatmentPatient', e.target.value)}
                  className="w-full border rounded-lg px-4 py-2"
                  required
                >
                  <option value="">เลือกผู้ป่วย...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.hn})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">อาการสำคัญ</label>
                <textarea
                  value={formData.treatmentSymptoms}
                  onChange={(e) => handleFormChange('treatmentSymptoms', e.target.value)}
                  className="w-full border rounded-lg px-4 py-2"
                  rows="3"
                  placeholder="ระบุอาการสำคัญ"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">การวินิจฉัย *</label>
                <textarea
                  value={formData.treatmentDiagnosis}
                  onChange={(e) => handleFormChange('treatmentDiagnosis', e.target.value)}
                  className="w-full border rounded-lg px-4 py-2"
                  rows="3"
                  placeholder="ระบุการวินิจฉัย"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">การรักษา/ยา *</label>
                <textarea
                  value={formData.treatmentPlan}
                  onChange={(e) => handleFormChange('treatmentPlan', e.target.value)}
                  className="w-full border rounded-lg px-4 py-2"
                  rows="4"
                  placeholder="ระบุการรักษาและยา"
                  required
                />
              </div>
              <button type="submit" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium">
                บันทึกการรักษา
              </button>
            </form>
          </div>
        )}

        {activeTab === 'certificate' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">ออกใบรับรองแพทย์</h2>
            <form onSubmit={handleCreateCertificate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">ผู้ป่วย *</label>
                <select
                  value={formData.certPatient}
                  onChange={(e) => handleFormChange('certPatient', e.target.value)}
                  className="w-full border rounded-lg px-4 py-2"
                  required
                >
                  <option value="">เลือกผู้ป่วย...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.hn})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">ประเภทใบรับรอง</label>
                <select
                  value={formData.certType}
                  onChange={(e) => handleFormChange('certType', e.target.value)}
                  className="w-full border rounded-lg px-4 py-2"
                >
                  <option>ใบรับรองแพทย์ทั่วไป</option>
                  <option>ใบรับรองการลาป่วย</option>
                  <option>ใบรับรองสุขภาพ</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">รายละเอียด *</label>
                <textarea
                  value={formData.certDetails}
                  onChange={(e) => handleFormChange('certDetails', e.target.value)}
                  className="w-full border rounded-lg px-4 py-2"
                  rows="5"
                  placeholder="ระบุรายละเอียด"
                  required
                />
              </div>
              {formData.certType === 'ใบรับรองการลาป่วย' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">ลาป่วยตั้งแต่</label>
                    <input
                      type="date"
                      value={formData.certStartDate}
                      onChange={(e) => handleFormChange('certStartDate', e.target.value)}
                      className="w-full border rounded-lg px-4 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">ถึงวันที่</label>
                    <input
                      type="date"
                      value={formData.certEndDate}
                      onChange={(e) => handleFormChange('certEndDate', e.target.value)}
                      className="w-full border rounded-lg px-4 py-2"
                    />
                  </div>
                </div>
              )}
              <button type="submit" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium">
                ออกใบรับรอง
              </button>
            </form>
          </div>
        )}

        {activeTab === 'lab' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold mb-6 text-gray-800">เพิ่มผลการตรวจ</h2>
              <form onSubmit={handleAddLabResult} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">เลือกผู้ป่วย *</label>
                    <select
                      value={formData.labPatient}
                      onChange={(e) => handleFormChange('labPatient', e.target.value)}
                      className="w-full border rounded-lg px-4 py-2"
                      required
                    >
                      <option value="">เลือกผู้ป่วย...</option>
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.hn})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">ประเภทการตรวจ</label>
                    <select
                      value={formData.labTestType}
                      onChange={(e) => handleFormChange('labTestType', e.target.value)}
                      className="w-full border rounded-lg px-4 py-2"
                    >
                      <option>ตรวจเลือด</option>
                      <option>ตรวจปัสสาวะ</option>
                      <option>X-Ray</option>
                      <option>อื่นๆ</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">ผลการตรวจ *</label>
                  <textarea
                    value={formData.labResult}
                    onChange={(e) => handleFormChange('labResult', e.target.value)}
                    className="w-full border rounded-lg px-4 py-2"
                    rows="4"
                    placeholder="ระบุผลการตรวจ"
                    required
                  />
                </div>
                <button type="submit" className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium">
                  บันทึกผลการตรวจ
                </button>
              </form>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold mb-6 text-gray-800">ผลการตรวจเลือดและสารคัดหลั่ง</h2>
              <div className="grid gap-4">
                {filteredLabs.map((lab) => (
                  <div key={lab.id} className="border rounded-lg p-4">
                    <h3 className="font-bold text-lg mb-3">
                      {lab.patientName} ({patients.find((p) => p.id === lab.patientId)?.hn})
                    </h3>
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="font-medium mb-2">{lab.testType} - {lab.date}</p>
                      <p className="text-sm mb-3">
                        สถานะ:{' '}
                        <span className={lab.result === 'ปกติ' ? 'text-green-600 font-semibold' : 'text-yellow-600 font-semibold'}>
                          {lab.result}
                        </span>
                      </p>
                      {lab.result === 'ปกติ' && (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div><span className="text-gray-600">WBC:</span> <span className="font-medium">{lab.wbc} cells/μL</span></div>
                          <div><span className="text-gray-600">RBC:</span> <span className="font-medium">{lab.rbc} M/μL</span></div>
                          <div><span className="text-gray-600">Hb:</span> <span className="font-medium">{lab.hb} g/dL</span></div>
                          <div><span className="text-gray-600">Platelet:</span> <span className="font-medium">{lab.platelet} /μL</span></div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'referral' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">ประวัติการส่งตัวผู้ป่วย</h2>
            <div className="space-y-4">
              {referrals.map((ref) => (
                <div key={ref.id} className="border rounded-lg p-4 bg-orange-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg">{ref.patientName}</h3>
                      <p className="text-gray-600">ส่งตัวไปยัง: {ref.hospital}</p>
                      <p className="text-sm text-gray-500 mt-2">วันที่: {ref.date}</p>
                      <p className="text-sm">เหตุผล: {ref.reason}</p>
                      <p className="text-sm text-gray-600">โดย: {ref.doctor}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      ref.status === 'รอติดตาม' ? 'bg-orange-200 text-orange-800' : 'bg-green-200 text-green-800'
                    }`}>
                      {ref.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* --------------------------- Staff --------------------------- */
const StaffDashboard = ({ onLogout, userData }) => {
  const [activeTab, setActiveTab] = useState('patients');
  const [searchTerm, setSearchTerm] = useState('');

  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [patientsError, setPatientsError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/patients`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'โหลดรายชื่อผู้ป่วยไม่สำเร็จ');
        setPatients(json.data || []);
      } catch (err) {
        setPatientsError(err.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
      } finally {
        setLoadingPatients(false);
      }
    };
    load();
  }, []);

  const [appointments, setAppointments] = useState([
    { id: 1, patientName: 'สมชาย ใจดี', date: '2025-10-20', time: '09:00', type: 'ตรวจรักษาทั่วไป', status: 'รอพบแพทย์' },
    { id: 2, patientName: 'สมหญิง รักสุข', date: '2025-10-20', time: '10:30', type: 'ตรวจสุขภาพประจำปี', status: 'รอพบแพทย์' },
    { id: 3, patientName: 'วิชัย มีสุข', date: '2025-10-21', time: '14:00', type: 'ตรวจติดตามผล', status: 'ยืนยันแล้ว' },
  ]);
  const [payments, setPayments] = useState([
    { id: 1, patientName: 'สมชาย ใจดี', date: '2025-10-15', service: 'ตรวจรักษาทั่วไป', amount: 500, method: 'เงินสด' },
    { id: 2, patientName: 'สมหญิง รักสุข', date: '2025-10-16', service: 'ตรวจเลือด', amount: 800, method: 'โอนเงิน' },
  ]);

  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showAddAppointment, setShowAddAppointment] = useState(false);
  const [formData, setFormData] = useState({
    patientName: '', patientAge: '', patientHN: '', patientTel: '',
    appointPatient: '', appointDate: '', appointTime: '', appointType: 'ตรวจรักษาทั่วไป',
    paymentPatient: '', paymentAmount: '', paymentMethod: 'เงินสด', paymentService: 'ตรวจรักษาทั่วไป'
  });
  const handleFormChange = (f, v) => setFormData((p) => ({ ...p, [f]: v }));

  const handleAddPatient = (e) => {
    e.preventDefault();
    if (!formData.patientName || !formData.patientAge || !formData.patientHN || !formData.patientTel) { alert('กรุณากรอกข้อมูลให้ครบถ้วน'); return; }
    const newPatient = {
      id: patients.length + 1,
      name: formData.patientName,
      age: parseInt(formData.patientAge, 10),
      hn: formData.patientHN,
      tel: formData.patientTel,
      lastVisit: new Date().toISOString().split('T')[0],
    };
    setPatients([...patients, newPatient]);
    setFormData({ ...formData, patientName: '', patientAge: '', patientHN: '', patientTel: '' });
    setShowAddPatient(false);
    alert('เพิ่มผู้ป่วยสำเร็จ (ตัวอย่าง)');
  };

  const handleAddAppointment = (e) => {
    e.preventDefault();
    if (!formData.appointPatient || !formData.appointDate || !formData.appointTime) { alert('กรุณากรอกข้อมูลให้ครบถ้วน'); return; }
    const newAppointment = {
      id: appointments.length + 1,
      patientName: formData.appointPatient,
      date: formData.appointDate,
      time: formData.appointTime,
      type: formData.appointType,
      status: 'รอพบแพทย์',
    };
    setAppointments([...appointments, newAppointment]);
    setFormData({ ...formData, appointPatient: '', appointDate: '', appointTime: '' });
    setShowAddAppointment(false);
    alert('สร้างนัดหมายสำเร็จ');
  };

  const handleAddPayment = (e) => {
    e.preventDefault();
    if (!formData.paymentPatient || !formData.paymentAmount) { alert('กรุณากรอกข้อมูลให้ครบถ้วน'); return; }
    const newPayment = {
      id: payments.length + 1,
      patientName: formData.paymentPatient,
      date: new Date().toISOString().split('T')[0],
      service: formData.paymentService,
      amount: parseInt(formData.paymentAmount, 10),
      method: formData.paymentMethod,
    };
    setPayments([...payments, newPayment]);
    setFormData({ ...formData, paymentPatient: '', paymentAmount: '' });
    alert('บันทึกการชำระเงินสำเร็จ');
  };

  const handlePrintAppointment = (apt) => {
    const w = window.open('', '', 'width=800,height=600');
    w.document.write(`
      <html><head><title>ใบนัดหมาย</title>
      <style>body{font-family:Arial;padding:40px}h1{color:#10b981}.info{margin:20px 0;line-height:2}</style>
      </head><body>
      <h1>🏥 ใบนัดหมาย</h1>
      <div class="info">
        <p><strong>ชื่อผู้ป่วย:</strong> ${apt.patientName}</p>
        <p><strong>วันที่นัด:</strong> ${apt.date}</p>
        <p><strong>เวลา:</strong> ${apt.time} น.</p>
        <p><strong>ประเภท:</strong> ${apt.type}</p>
        <p><strong>สถานะ:</strong> ${apt.status}</p>
      </div>
      <p style="margin-top:40px">กรุณามาตรงเวลา</p>
      </body></html>
    `);
    w.document.close(); w.print();
  };

  const filteredPatients = patients.filter((p) =>
    String(p.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    String(p.hn || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    String(p.tel || '').includes(searchTerm || '')
  );
  const filteredAppointments = appointments.filter((a) =>
    a.patientName.toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    a.type.toLowerCase().includes((searchTerm || '').toLowerCase())
  );
  const filteredPayments = payments.filter((p) =>
    p.patientName.toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    p.service.toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const tabs = [
    { id: 'patients', name: 'ทะเบียนผู้ป่วย', icon: Users },
    { id: 'appointments', name: 'การนัดหมาย', icon: Calendar },
    { id: 'payment', name: 'ชำระเงิน', icon: DollarSign },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-green-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <ClipboardList size={28} />
            <div>
              <h1 className="text-xl font-bold">ระบบพนักงาน</h1>
              <p className="text-sm text-green-100">{userData.name}</p>
            </div>
          </div>
          <button onClick={onLogout} className="bg-green-700 hover:bg-green-800 px-4 py-2 rounded-lg flex items-center space-x-2">
            <LogOut size={20} />
            <span>ออกจากระบบ</span>
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setSearchTerm(''); }}
                  className={`px-4 py-3 flex items-center space-x-2 ${
                    activeTab === tab.id ? 'bg-white text-green-600 rounded-t-lg' : 'text-green-100 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  <span className="font-medium">{tab.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหา (ชื่อ, HN, เบอร์โทร)"
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {activeTab === 'patients' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">จัดการทะเบียนผู้ป่วย</h2>
              <button
                onClick={() => setShowAddPatient(!showAddPatient)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2"
              >
                <span>{showAddPatient ? 'ยกเลิก' : '+ เพิ่มผู้ป่วยใหม่'}</span>
              </button>
            </div>

            {showAddPatient && (
              <div className="mb-6 p-4 bg-green-50 rounded-lg">
                <h3 className="font-bold mb-4">เพิ่มผู้ป่วยใหม่</h3>
                <form onSubmit={handleAddPatient} className="grid grid-cols-2 gap-4">
                  <input type="text" value={formData.patientName} onChange={(e) => handleFormChange('patientName', e.target.value)} placeholder="ชื่อ-นามสกุล *" className="border rounded-lg px-4 py-2" required />
                  <input type="number" value={formData.patientAge} onChange={(e) => handleFormChange('patientAge', e.target.value)} placeholder="อายุ *" className="border rounded-lg px-4 py-2" required />
                  <input type="text" value={formData.patientHN} onChange={(e) => handleFormChange('patientHN', e.target.value)} placeholder="HN *" className="border rounded-lg px-4 py-2" required />
                  <input type="text" value={formData.patientTel} onChange={(e) => handleFormChange('patientTel', e.target.value)} placeholder="เบอร์โทร *" className="border rounded-lg px-4 py-2" required />
                  <button type="submit" className="col-span-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">บันทึกผู้ป่วย</button>
                </form>
              </div>
            )}

            <div className="overflow-x-auto">
              {loadingPatients && <p>กำลังโหลดข้อมูลผู้ป่วย...</p>}
              {patientsError && <p className="text-red-600">{patientsError}</p>}
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">HN</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">ชื่อ-นามสกุล</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">อายุ</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">เบอร์โทร</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">มาล่าสุด</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPatients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{patient.hn}</td>
                      <td className="px-4 py-3 font-medium">{patient.name}</td>
                      <td className="px-4 py-3">{patient.age}</td>
                      <td className="px-4 py-3">{patient.tel}</td>
                      <td className="px-4 py-3">{patient.lastVisit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'appointments' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">จัดการการนัดหมาย</h2>
              <button onClick={() => setShowAddAppointment(!showAddAppointment)} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2">
                <span>{showAddAppointment ? 'ยกเลิก' : '+ นัดหมายใหม่'}</span>
              </button>
            </div>

            {showAddAppointment && (
              <div className="mb-6 p-4 bg-green-50 rounded-lg">
                <h3 className="font-bold mb-4">สร้างนัดหมายใหม่</h3>
                <form onSubmit={handleAddAppointment} className="grid grid-cols-2 gap-4">
                  <select value={formData.appointPatient} onChange={(e) => handleFormChange('appointPatient', e.target.value)} className="border rounded-lg px-4 py-2" required>
                    <option value="">เลือกผู้ป่วย *</option>
                    {patients.map((p) => <option key={p.id} value={p.name}>{p.name} ({p.hn})</option>)}
                  </select>
                  <select value={formData.appointType} onChange={(e) => handleFormChange('appointType', e.target.value)} className="border rounded-lg px-4 py-2">
                    <option>ตรวจรักษาทั่วไป</option>
                    <option>ตรวจสุขภาพประจำปี</option>
                    <option>ตรวจติดตามผล</option>
                  </select>
                  <input type="date" value={formData.appointDate} onChange={(e) => handleFormChange('appointDate', e.target.value)} className="border rounded-lg px-4 py-2" required />
                  <input type="time" value={formData.appointTime} onChange={(e) => handleFormChange('appointTime', e.target.value)} className="border rounded-lg px-4 py-2" required />
                  <button type="submit" className="col-span-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">สร้างนัดหมาย</button>
                </form>
              </div>
            )}

            <div className="space-y-4">
              {filteredAppointments.map((apt) => (
                <div key={apt.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg">{apt.patientName}</h3>
                      <p className="text-gray-600">วันที่: {apt.date} เวลา: {apt.time}</p>
                      <p className="text-gray-600">ประเภท: {apt.type}</p>
                      <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium ${
                        apt.status === 'รอพบแพทย์' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {apt.status}
                      </span>
                    </div>
                    <button onClick={() => handlePrintAppointment(apt)} className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-1">
                      <Printer size={16} />
                      <span>พิมพ์</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'payment' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">รับชำระค่าบริการ</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="border rounded-lg p-4">
                <h3 className="font-bold text-lg mb-4">บันทึกการชำระเงิน</h3>
                <form onSubmit={handleAddPayment} className="space-y-4">
                  <select value={formData.paymentPatient} onChange={(e) => handleFormChange('paymentPatient', e.target.value)} className="w-full border rounded-lg px-4 py-2" required>
                    <option value="">เลือกผู้ป่วย *</option>
                    {patients.map((p) => <option key={p.id} value={p.name}>{p.name} ({p.hn})</option>)}
                  </select>
                  <select value={formData.paymentService} onChange={(e) => handleFormChange('paymentService', e.target.value)} className="w-full border rounded-lg px-4 py-2">
                    <option>ตรวจรักษาทั่วไป</option>
                    <option>ตรวจเลือด</option>
                    <option>ตรวจสารคัดหลั่ง</option>
                    <option>ใบรับรองแพทย์</option>
                  </select>
                  <input type="number" value={formData.paymentAmount} onChange={(e) => handleFormChange('paymentAmount', e.target.value)} placeholder="จำนวนเงิน (บาท) *" className="w-full border rounded-lg px-4 py-2" required />
                  <select value={formData.paymentMethod} onChange={(e) => handleFormChange('paymentMethod', e.target.value)} className="w-full border rounded-lg px-4 py-2">
                    <option>เงินสด</option>
                    <option>บัตรเครดิต</option>
                    <option>โอนเงิน</option>
                    <option>QR Code</option>
                  </select>
                  <button type="submit" className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 font-medium">บันทึกการชำระเงิน</button>
                </form>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold text-lg mb-4">ประวัติการชำระเงิน</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredPayments.map((pay) => (
                    <div key={pay.id} className="bg-gray-50 p-3 rounded-lg">
                      <div className="flex justify-between">
                        <span className="font-medium">{pay.patientName}</span>
                        <span className="text-green-600 font-bold">{pay.amount.toLocaleString()} บาท</span>
                      </div>
                      <p className="text-sm text-gray-600">{pay.service} | {pay.method}</p>
                      <p className="text-xs text-gray-500">{pay.date}</p>
                    </div>
                  ))}
                  <div className="pt-3 border-t mt-3">
                    <div className="flex justify-between font-bold text-lg">
                      <span>รวม</span>
                      <span className="text-green-600">
                        {payments.reduce((a, b) => a + b.amount, 0).toLocaleString()} บาท
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* --------------------------- Owner --------------------------- */
const OwnerDashboard = ({ onLogout, userData }) => {
  const [activeTab, setActiveTab] = useState('staff');
  const [searchTerm, setSearchTerm] = useState('');

  const [staff, setStaff] = useState([
    { id: 1, name: 'สมศรี พนักงานดี', position: 'พนักงานต้อนรับ', tel: '081-111-2222', startDate: '2023-01-15', salary: 15000 },
    { id: 2, name: 'วิไล ช่วยเหลือ', position: 'เจ้าหน้าที่การเงิน', tel: '082-222-3333', startDate: '2023-03-20', salary: 18000 },
  ]);
  const [revenue] = useState([
    { date: '2025-10-15', amount: 15000, services: 8, type: 'ตรวจรักษา' },
    { date: '2025-10-16', amount: 22000, services: 12, type: 'ตรวจรักษา' },
    { date: '2025-10-17', amount: 18000, services: 10, type: 'ตรวจรักษา' },
  ]);

  const [showAddStaff, setShowAddStaff] = useState(false);
  const [formData, setFormData] = useState({ staffName: '', staffPosition: '', staffTel: '', staffSalary: '' });
  const handleFormChange = (f, v) => setFormData((p) => ({ ...p, [f]: v }));

  const handleAddStaff = (e) => {
    e.preventDefault();
    if (!formData.staffName || !formData.staffPosition || !formData.staffTel || !formData.staffSalary) { alert('กรุณากรอกข้อมูลให้ครบถ้วน'); return; }
    const newStaff = {
      id: staff.length + 1,
      name: formData.staffName,
      position: formData.staffPosition,
      tel: formData.staffTel,
      salary: parseInt(formData.staffSalary, 10),
      startDate: new Date().toISOString().split('T')[0],
    };
    setStaff([...staff, newStaff]);
    setFormData({ staffName: '', staffPosition: '', staffTel: '', staffSalary: '' });
    setShowAddStaff(false);
    alert('เพิ่มพนักงานสำเร็จ');
  };

  const totalRevenue = revenue.reduce((a, b) => a + b.amount, 0);
  const totalServices = revenue.reduce((a, b) => a + b.services, 0);
  const totalSalary = staff.reduce((a, b) => a + b.salary, 0);

  const filteredStaff = staff.filter((s) =>
    s.name.toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    s.position.toLowerCase().includes((searchTerm || '').toLowerCase())
  );
  const filteredRevenue = revenue.filter((r) =>
    r.type.toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const tabs = [
    { id: 'staff', name: 'ทะเบียนพนักงาน', icon: Users },
    { id: 'revenue', name: 'รายได้', icon: DollarSign },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-purple-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Users size={28} />
            <div>
              <h1 className="text-xl font-bold">ระบบเจ้าของคลินิก</h1>
              <p className="text-sm text-purple-100">{userData.name}</p>
            </div>
          </div>
          <button onClick={onLogout} className="bg-purple-700 hover:bg-purple-800 px-4 py-2 rounded-lg flex items-center space-x-2">
            <LogOut size={20} />
            <span>ออกจากระบบ</span>
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setSearchTerm(''); }}
                  className={`px-4 py-3 flex items-center space-x-2 ${
                    activeTab === tab.id ? 'bg-white text-purple-600 rounded-t-lg' : 'text-purple-100 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  <span className="font-medium">{tab.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหา"
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {activeTab === 'staff' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">จัดการทะเบียนพนักงาน</h2>
              <button onClick={() => setShowAddStaff(!showAddStaff)} className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center space-x-2">
                <span>{showAddStaff ? 'ยกเลิก' : '+ เพิ่มพนักงาน'}</span>
              </button>
            </div>

            {showAddStaff && (
              <div className="mb-6 p-4 bg-purple-50 rounded-lg">
                <h3 className="font-bold mb-4">เพิ่มพนักงานใหม่</h3>
                <form onSubmit={handleAddStaff} className="grid grid-cols-2 gap-4">
                  <input type="text" value={formData.staffName} onChange={(e) => handleFormChange('staffName', e.target.value)} placeholder="ชื่อ-นามสกุล *" className="border rounded-lg px-4 py-2" required />
                  <input type="text" value={formData.staffPosition} onChange={(e) => handleFormChange('staffPosition', e.target.value)} placeholder="ตำแหน่ง *" className="border rounded-lg px-4 py-2" required />
                  <input type="text" value={formData.staffTel} onChange={(e) => handleFormChange('staffTel', e.target.value)} placeholder="เบอร์โทร *" className="border rounded-lg px-4 py-2" required />
                  <input type="number" value={formData.staffSalary} onChange={(e) => handleFormChange('staffSalary', e.target.value)} placeholder="เงินเดือน (บาท) *" className="border rounded-lg px-4 py-2" required />
                  <button type="submit" className="col-span-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">บันทึกพนักงาน</button>
                </form>
              </div>
            )}

            <div className="grid gap-4">
              {filteredStaff.map((s) => (
                <div key={s.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start space-x-4">
                      <div className="bg-purple-100 rounded-full w-16 h-16 flex items-center justify-center">
                        <User size={32} className="text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{s.name}</h3>
                        <p className="text-gray-600">ตำแหน่ง: {s.position}</p>
                        <p className="text-gray-600">โทร: {s.tel}</p>
                        <p className="text-gray-600">เงินเดือน: {s.salary.toLocaleString()} บาท/เดือน</p>
                        <p className="text-sm text-gray-500 mt-2">เริ่มงาน: {s.startDate}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 bg-purple-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-gray-700">จำนวนพนักงาน</p>
                  <p className="font-bold text-2xl text-purple-600">{staff.length} คน</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-700">ค่าใช้จ่ายเงินเดือนรวม</p>
                  <p className="font-bold text-2xl text-purple-600">{totalSalary.toLocaleString()} บาท</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'revenue' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg shadow-lg p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold">รายได้รวม</h3>
                  <DollarSign size={32} />
                </div>
                <p className="text-3xl font-bold">{totalRevenue.toLocaleString()}</p>
                <p className="text-green-100 text-sm mt-1">บาท</p>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg shadow-lg p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold">จำนวนบริการ</h3>
                  <Activity size={32} />
                </div>
                <p className="text-3xl font-bold">{totalServices}</p>
                <p className="text-blue-100 text-sm mt-1">ครั้ง</p>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg shadow-lg p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold">ค่าเฉลี่ย/ครั้ง</h3>
                  <FileText size={32} />
                </div>
                <p className="text-3xl font-bold">{Math.round(totalRevenue / totalServices).toLocaleString()}</p>
                <p className="text-purple-100 text-sm mt-1">บาท</p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold mb-6 text-gray-800">รายละเอียดรายได้</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">วันที่</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">ประเภทบริการ</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">จำนวน (ครั้ง)</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">รายได้ (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredRevenue.map((rev, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{rev.date}</td>
                        <td className="px-4 py-3">{rev.type}</td>
                        <td className="px-4 py-3 text-right">{rev.services}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">{rev.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold">
                      <td className="px-4 py-3" colSpan={2}>รวมทั้งหมด</td>
                      <td className="px-4 py-3 text-right">{totalServices}</td>
                      <td className="px-4 py-3 text-right text-green-600">{totalRevenue.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    const w = window.open('', '', 'width=800,height=600');
                    w.document.write(`
                      <html><head><title>รายงานรายได้</title>
                      <style>body{font-family:Arial;padding:40px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}</style>
                      </head><body>
                        <h1>รายงานรายได้คลินิก</h1>
                        <table>
                          <tr><th>วันที่</th><th>ประเภท</th><th>จำนวน</th><th>รายได้</th></tr>
                          ${revenue.map(r => `<tr><td>${r.date}</td><td>${r.type}</td><td>${r.services}</td><td>${r.amount.toLocaleString()}</td></tr>`).join('')}
                          <tr><td colspan="2"><b>รวม</b></td><td><b>${totalServices}</b></td><td><b>${totalRevenue.toLocaleString()}</b></td></tr>
                        </table>
                      </body></html>
                    `);
                    w.document.close(); w.print();
                  }}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2"
                >
                  <Printer size={18} />
                  <span>พิมพ์รายงาน</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-bold mb-4 text-gray-800">กราฟรายได้รายวัน</h3>
              <div className="h-64 flex items-end justify-around space-x-2">
                {revenue.map((rev, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-gradient-to-t from-purple-600 to-purple-400 rounded-t-lg transition-all hover:opacity-80"
                      style={{ height: `${(rev.amount / Math.max(...revenue.map(r => r.amount))) * 100}%` }}
                    />
                    <p className="text-xs text-gray-600 mt-2 text-center">
                      {new Date(rev.date).getDate()}/{new Date(rev.date).getMonth() + 1}
                    </p>
                    <p className="text-xs font-bold text-purple-600">{rev.amount.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* --------------------------- App Root --------------------------- */
export default function ClinicManagementApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const handleLogin = (user) => setCurrentUser(user);
  const handleLogout = () => setCurrentUser(null);

  if (!currentUser) return <Login onLogin={handleLogin} />;
  if (currentUser.role === 'doctor') return <DoctorDashboard onLogout={handleLogout} userData={currentUser} />;
  if (currentUser.role === 'staff') return <StaffDashboard onLogout={handleLogout} userData={currentUser} />;
  if (currentUser.role === 'owner') return <OwnerDashboard onLogout={handleLogout} userData={currentUser} />;
  return null;
}
