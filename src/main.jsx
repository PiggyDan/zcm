import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChevronDown, ChevronUp, Plus, Trash2, CheckCircle2, FileText } from "lucide-react";
import companyLogo from "./assets/logos/zcm.png";
import "./styles.css";
import SafetyReader from "./SafetyReader";

const emptyEmployee = () => ({ name: "", position: "", phone: "" });

const companyOptions = [
  { value: "Засагчандмань майнз ХХК" },
  { value: "Эрхэт түнш ХХК" },
  { value: "Титантауэр констракшн ХХК" },
  { value: "Грийн энержи ХХК" },
  { value: "Дээдийн говийн жим ХХК" },
  { value: "Хонгор алтайн тал ХХК" },
  { value: "Эйч эйч ай ХХК" },
  { value: "Форчо майнинг ХХК" },
  { value: "Хар ирвэс ХХК" },
  { value: "Бусад ХХК" }
];

const SIGNATURE_MAX_EDGE = 900;

/**
 * Reads a signature image and scales it down, so a phone photo does not
 * exceed the request body limit once base64-encoded.
 */
function readScaledImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const dataUrl = reader.result;
      const image = new Image();

      image.onerror = () => reject(new Error("decode failed"));
      image.onload = () => {
        const scale = Math.min(
          1,
          SIGNATURE_MAX_EDGE / Math.max(image.width, image.height)
        );

        if (scale === 1 && dataUrl.length < 700_000) {
          resolve(dataUrl);
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };

      image.src = dataUrl;
    };

    reader.readAsDataURL(file);
  });
}

function CompanyLogo() {
  return (
    <img
      src={companyLogo}
      alt="Лого"
      className="companyLogoSvg"
      draggable="false"
    />
  );
}

function App() {
  const [employees, setEmployees] = useState([emptyEmployee()]);
  const [showSafety, setShowSafety] = useState(false);
  const [showReader, setShowReader] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [signature, setSignature] = useState("");
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState({
    company: companyOptions[0].value,
    department: "",
    travelDate: "",
    direction: "",
    otherDirection: "",
    transport: "Байгууллагын унаагаар",
    driver: "",
    vehicle: "",
    vehiclePlate: ""
  });

  const updateForm = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const updateEmployee = (index, key, value) => {
    const next = [...employees];
    next[index] = { ...next[index], [key]: value };
    setEmployees(next);
  };

  const addEmployee = () => {
    if (employees.length < 4) {
      setEmployees([...employees, emptyEmployee()]);
    }
  };

  const removeEmployee = (index) => {
    if (employees.length === 1) return;
    setEmployees(employees.filter((_, i) => i !== index));
  };

  const submit = async (e) => {
    e.preventDefault();

    if (sending) return;

    const missing = [];
    if (!form.vehicle.trim()) missing.push("Автомашины марк");
    if (!/^[0-9]{4} [А-ЯӨҮЁ]{3}$/.test(form.vehiclePlate.trim())) missing.push("Улсын дугаар (9911 УБА)");

    if (!form.department.trim()) missing.push("Харьяалагдах хэлтэс");
    if (!form.travelDate) missing.push("Аялах өдөр");
    if (!form.direction) missing.push("Аялах чиглэл");
    if (form.direction === "Бусад" && !form.otherDirection.trim()) missing.push("Бусад явах чиглэл");
    if (!form.transport.trim()) missing.push("Аялах тээврийн хэрэгсэл");

    employees.forEach((employee, index) => {
      if (!employee.name.trim()) missing.push(`Ажилтан ${index + 1} - Овог нэр`);
      if (!employee.position.trim()) missing.push(`Ажилтан ${index + 1} - Албан тушаал`);
      if (!employee.phone.trim()) missing.push(`Ажилтан ${index + 1} - Утасны дугаар`);
    });

    if (!signature) missing.push("Гарын үсэг");
    if (!accepted) missing.push("Танилцсан нөхцөл");

    if (missing.length > 0) {
      alert(`Дутуу байна: ${missing[0]}`);
      return;
    }

    setSending(true);

    try {
      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          form: { ...form, vehicle: `${form.vehicle.trim()}, ${form.vehiclePlate.trim()}` },
          employees,
          signature
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to send the form.");
      }

      setSubmitted(true);
      setAccepted(false);
      setSignature("");
      setEmployees([emptyEmployee()]);
      setForm({
        company: companyOptions[0].value,
        department: "",
        travelDate: "",
        direction: "",
        otherDirection: "",
        transport: "Байгууллагын унаагаар",
        driver: "",
        vehicle: "",
        vehiclePlate: ""
      });
      setShowSafety(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      alert(error.message || "Илгээхэд асуудал гарлаа. Та дахин оролдоно уу.");
    } finally {
      setSending(false);
    }
  };

  const handleSignatureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSignature(await readScaledImage(file));
    } catch {
      alert("Зургийг уншиж чадсангүй. Өөр зураг сонгоно уу.");
    }
  };

  if (submitted) {
    return (
      <main className="page">
        <div className="formCard successScreen">
          <div className="success successScreenBox">
            <CheckCircle2 size={20} />
            <div>
              <strong>Амжилттай илгээгдлээ.</strong>
              <span>Аяллын мэдээлэл бүртгэгдлээ.</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="formCard">
        <header className="docHeader">
          <div className="logoBox">
            <CompanyLogo />
          </div>
          <div className="titleArea">
            <h1>ЗАСАГЧАНДМАНЬ МАЙНЗ ХХК</h1>
            <h1>АТҮТ БОЛОН ЗАМЫН УНААГААР ЗОРЧИХ ҮЕИЙН</h1>
            <h1>АЮУЛГҮЙ АЖИЛЛАГААНЫ ЗААВАРЧИЛГАА</h1>            
            <div className="meta">
              <span>Хувилбар: 01</span>
              <span>   ЗЧМ-УТ-Ж39-Х01 Холын аяллын журам    </span>
            </div>
          </div>
        </header>

        <form onSubmit={submit}>
          <Section title="Үндсэн мэдээлэл">
            <Field label="Компани">
              <select name="company" value={form.company} onChange={updateForm}>
                {companyOptions.map((company) => (
                  <option key={company.value} value={company.value}>
                    {company.value}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Харьяалагдах хэлтэс *">
              <select
                required
                name="department"
                value={form.department}
                onChange={updateForm}
              >
                <option value="">Сонгох</option>
                <option value="Захиргаа">Захиргаа</option>
                <option value="Хүний нөөц">Хүний нөөц</option>
                <option value="ХАБЭАБО">ХАБЭАБО</option>
                <option value="Уулын хэлтэс">Уулын хэлтэс</option>
                <option value="Тэсэлгээний хэлтэс">Тэсэлгээний хэлтэс</option>
                <option value="Удирдлага">Удирдлага</option>
                <option value="Санхүү">Санхүү</option>
                <option value="Хууль">Хууль</option>
                <option value="Үйл ажиллагаа">Үйл ажиллагаа</option>
                <option value="IT">IT</option>
                <option value="Бусад">Бусад</option>
              </select>
            </Field>

            <div className="twoCols">
              <Field label="Аялах өдөр *">
                <input
                  required
                  type="date"
                  name="travelDate"
                  value={form.travelDate}
                  onChange={updateForm}
                />
              </Field>

              <Field label="Аялах чиглэл *">
                <select
                  required
                  name="direction"
                  value={form.direction}
                  onChange={updateForm}
                >
                  <option value="">Сонгох</option>
                  <option>Улаанбаатар-Сайншанд</option>
                  <option>Улаанбаатар-Чандмань уул төмрийн хүдрийн уурхай</option>
                  <option>Улаанбаатар-Дэлгэрэх сум</option>
                  <option>Улаанбаатар-Гурвантэс</option>
                  <option>Сайншанд-Чандмань уул төмрийн хүдрийн уурхай</option>
                  <option>Сайншанд-Дэлгэрэх сум</option>
                  <option>Сайншанд-Улаанбаатар</option>
                  <option>Сайншанд-Гурвантэс</option>
                  <option>Гурвантэс-Улаанбаатар</option>
                  <option>Бусад</option>
                </select>
              </Field>
            </div>

            {form.direction === "Бусад" && (
              <Field label="Бусад явах чиглэл *">
                <input
                  required
                  name="otherDirection"
                  value={form.otherDirection}
                  onChange={updateForm}
                  placeholder="Жишээ: Гурвантэс - Даланзадгад"
                />
              </Field>
            )}
          </Section>

          <Section title="Тээврийн хэрэгсэл">
            <Field label="Аялах тээврийн хэрэгсэл *">
              <select
                name="transport"
                value={form.transport}
                onChange={updateForm}
              >
                <option>Байгууллагын унаагаар</option>
                <option>Замын унаа</option>
                <option>Хувийн унаа</option>
                <option>АТҮТ / Нийтийн тээвэр</option>
                <option>Гэрээт компаний унаа</option>                
                <option>Бусад</option>
              </select>
            </Field>

            <Field label="Жолоочийн нэр, утасны дугаар">
              <input
                name="driver"
                value={form.driver}
                onChange={updateForm}
                placeholder="Жишээ: Бат 99112233"
              />
            </Field>

            <div className="twoCols">
            <Field label="Автомашины марк *">
              <input
                required
                name="vehicle"
                value={form.vehicle}
                onChange={updateForm}
                placeholder="Жишээ: Lexus LX700"
              />
            </Field>
            <Field label="Улсын дугаар *">
              <div className="vehiclePlate">
                <span className="plateCountry" aria-hidden="true">MNG</span>
                <input
                  required
                  aria-label="Улсын дугаар"
                  aria-describedby="plateHint"
                  name="vehiclePlate"
                  value={form.vehiclePlate}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase().replace(/[\s-]/g, "");
                    setForm({ ...form, vehiclePlate: value.length > 4 ? `${value.slice(0, 4)} ${value.slice(4)}` : value });
                  }}
                  pattern="[0-9]{4} [А-ЯӨҮЁ]{3}"
                  maxLength={8}
                  placeholder="9911 УБА"
                  title="4 орон тоо, 3 кирилл үсэг оруулна уу. Жишээ: 9911 УБА"
                />
              </div>
              <small id="plateHint">4 орон тоо, 3 кирилл үсэг. Жишээ: 9911 УБА</small>
            </Field>
            </div>
          </Section>

          <Section title={`Зорчих ажилтан (${employees.length})`}>
            <p className="helper">Хамгийн ихдээ 4 ажилтан бүртгэх боломжтой.</p>

            {employees.map((employee, index) => (
              <div className="employeeCard" key={index}>
                <div className="employeeHead">
                  <strong>Ажилтан {index + 1}</strong>
                  {employees.length > 1 && (
                    <button
                      type="button"
                      className="iconBtn danger"
                      onClick={() => removeEmployee(index)}
                      aria-label="Устгах"
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>

                <Field label="Овог нэр *">
                  <input
                    required
                    name="employee-name"
                    value={employee.name}
                    onChange={(e) =>
                      updateEmployee(index, "name", e.target.value)
                    }
                    placeholder="Овог нэр"
                  />
                </Field>

                <div className="twoCols">
                  <Field label="Албан тушаал *">
                    <input
                      required
                      name="employee-position"
                      value={employee.position}
                      onChange={(e) =>
                        updateEmployee(index, "position", e.target.value)
                      }
                      placeholder="Албан тушаал"
                    />
                  </Field>

                  <Field label="Утасны дугаар *">
                    <input
                      required
                      name="employee-phone"
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]+"
                      value={employee.phone}
                      onChange={(e) =>
                        updateEmployee(index, "phone", e.target.value.replace(/[^0-9]/g, ""))
                      }
                      placeholder="Утас"
                    />
                  </Field>
                </div>
              </div>
            ))}

            {employees.length < 4 && (
              <button type="button" className="addBtn" onClick={addEmployee}>
                <Plus size={17} /> Ажилтан нэмэх
              </button>
            )}
          </Section>

          <Section title="Аюулгүй ажиллагааны зааварчилгаа">
            <div className="signatureBox">
              <div className="signatureHeader">
                <span>Гарын үсэг</span>
                <label className="uploadSignature">
                  <input type="file" accept="image/*" onChange={handleSignatureUpload} />
                  <span>Зураг сонгох</span>
                </label>
              </div>

              {signature ? (
                <img className="signaturePreview" src={signature} alt="Signature preview" />
              ) : (
                <div className="signaturePlaceholder">Гарын үсгийн зураг оруулна уу</div>
              )}
            </div>

            <button
              type="button"
              className="safetyToggle"
              onClick={() => setShowSafety(!showSafety)}
            >
              <span>
                <strong>Зааварчилгаа унших</strong>
                <small>Хувийн аюулгүй байдал, аяллын аюулгүй байдал, хүнсний эрүүл ахуй</small>
              </span>
              {showSafety ? <ChevronUp /> : <ChevronDown />}
            </button>

            <button
              type="button"
              className="safetyDownload"
              onClick={() => setShowReader(true)}
            >
              <FileText size={18} aria-hidden="true" />
              <span>Зааварчилгаа PDF унших</span>
            </button>
            {showReader && <SafetyReader onClose={() => setShowReader(false)} />}

            {showSafety && (
              <div className="safety">
                <SafetyBlock title="Хувь хүний аюулгүй байдал">
                  <li>Аялалд гарахын өмнө өөрийн эд зүйлсээ шалгах.</li>
                  <li>Эрүүл мэнд, биеийн байдалдаа анхаарах.</li>
                  <li>Шаардлагатай эм, хувийн хэрэгслээ биедээ авч явах.</li>
                  <li>Цаг агаар, нөхцөлдөө тохируулан хувцаслах.</li>
                  <li>Аяллын турш согтууруулах ундаа, сэтгэцэд нөлөөлөх бодис хэрэглэхгүй байх.</li>
                </SafetyBlock>

                <SafetyBlock title="Аяллын аюулгүй байдал">
                  <li>Тээврийн хэрэгслийн бүрэн бүтэн байдлыг шалгах.</li>
                  <li>Суудлын бүсийг тогтмол хэрэглэх.</li>
                  <li>Жолоочийн анхаарлыг сарниулахгүй байх.</li>
                  <li>Тээврийн хэрэгсэл бүрэн зогссоны дараа буух.</li>
                  <li>Аяллын замд зөвшөөрөлгүй бууж үлдэхгүй байх.</li>
                  <li>Жолооч хэт ядарсан бол хөдөлгөөнийг зогсоож, ахлах ажилтанд мэдэгдэх.</li>
                </SafetyBlock>

                <SafetyBlock title="Хүнсний эрүүл ахуй">
                  <li>Хүнсний бүтээгдэхүүний чанар, хугацааг шалгах.</li>
                  <li>Өөрийн эрүүл мэндэд тохирохгүй хүнс хэрэглэхгүй байх.</li>
                  <li>Замд хэрэглэх хүнс, усыг урьдчилан бэлтгэх.</li>
                </SafetyBlock>

                <div className="emergency">
                  <strong>Яаралтай үед холбоо барих</strong>
                  <span>Онцгой байдал: 105</span>
                  <span>Цагдаа: 102</span>
                  <span>Эмнэлэг: 103</span>
                  <span>Байгууллага: 75053443</span>
                </div>
              </div>
            )}

            <label className="accept">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>
                Дээрх шаардлагыг бүрэн уншиж танилцсан, ойлгосон бөгөөд мөрдөхөө зөвшөөрч байна.
              </span>
            </label>
          </Section>

          <div className="submitArea">
            <button className="submitBtn" type="submit" disabled={!accepted || sending}>
              {sending ? "Илгээж байна..." : "Илгээх"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section className="section">
      <div className="sectionTitle">{title}</div>
      <div className="sectionBody">{children}</div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SafetyBlock({ title, children }) {
  return (
    <div className="safetyBlock">
      <h3>{title}</h3>
      <ol>{children}</ol>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
