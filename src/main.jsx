import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronDown,
  Plus,
  Trash2,
  CheckCircle2,
  FileText,
  ClipboardList,
  Truck,
  Users,
  ShieldCheck,
  ImageUp,
  Send,
  Loader2,
  PhoneCall
} from "lucide-react";
import companyLogo from "./assets/logos/UTLOGO.png";
import "./styles.css";
import SafetyReader from "./SafetyReader";

const emptyEmployee = () => ({ name: "", position: "", phone: "" });

const companyOptions = [
  { value: "Өнөд Түнш ХХК" },
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
    otherCompany: "",
    department: "",
    travelDate: "",
    direction: "",
    otherDirection: "",
    transport: "Байгууллагын унаагаар",
    driver: "",
    driverPhone: "",
    vehicle: "",
    vehiclePlate: ""
  });

  const isPublicTransport = form.transport === "АТҮТ / Нийтийн тээвэр";
  const isOtherCompany = form.company === "Бусад ХХК";

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
    if (!isPublicTransport) {
    if (!form.driver.trim()) missing.push("Жолоочийн нэр");
    if (!/^[0-9]+$/.test(form.driverPhone)) missing.push("Жолоочийн утасны дугаар");
    if (!form.vehicle.trim()) missing.push("Автомашины марк");
    if (!/^[0-9]{4} [А-ЯӨҮЁ]{3}$/.test(form.vehiclePlate.trim())) missing.push("Улсын дугаар (9911 УБА)");

    }

    if (isOtherCompany && !form.otherCompany.trim()) missing.push("Компанийн нэр");
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
          form: {
            ...form,
            company: isOtherCompany ? form.otherCompany.trim() : form.company,
            driver: isPublicTransport ? "" : form.driver,
            driverPhone: isPublicTransport ? "" : form.driverPhone,
            vehicle: isPublicTransport ? "" : `${form.vehicle.trim()}, ${form.vehiclePlate.trim()}`,
            vehiclePlate: isPublicTransport ? "" : form.vehiclePlate
          },
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
        otherCompany: "",
        department: "",
        travelDate: "",
        direction: "",
        otherDirection: "",
        transport: "Байгууллагын унаагаар",
        driver: "",
        driverPhone: "",
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
      <main className="page pageCentered">
        <div className="successCard">
          <div className="successIcon">
            <CheckCircle2 size={40} strokeWidth={2.2} />
          </div>
          <h2>Амжилттай илгээгдлээ</h2>
          <p>Аяллын мэдээлэл бүртгэгдлээ. Аюулгүй аялаарай!</p>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="page">
      <div className="shell">
        <header className="hero">
          <div className="logoBox">
            <CompanyLogo />
          </div>
          <div className="titleArea">
            <p className="eyebrow">Өнөд Түнш ХХК</p>
            <h1>
              АТҮТ болон замын унаагаар зорчих үеийн
              аюулгүй ажиллагааны зааварчилгаа
            </h1>
            <div className="metaRow">
              <span className="metaPill">Хувилбар: 01</span>
            </div>
          </div>
        </header>

        <form onSubmit={submit} className="formStack">
          <Section step={1} icon={ClipboardList} title="Үндсэн мэдээлэл">
            <Field label="Компани">
              <select name="company" value={form.company} onChange={updateForm}>
                {companyOptions.map((company) => (
                  <option key={company.value} value={company.value}>
                    {company.value}
                  </option>
                ))}
              </select>
            </Field>

            {isOtherCompany && (
              <Field label="Компанийн нэр *">
                <input
                  required
                  autoFocus
                  name="otherCompany"
                  value={form.otherCompany}
                  onChange={updateForm}
                  placeholder="Жишээ: Монгол майнинг ХХК"
                />
              </Field>
            )}

            <Field label="Харьяалагдах хэлтэс *">
              <select
                required
                name="department"
                value={form.department}
                onChange={updateForm}
              >
                <option value="">Сонгох</option>
                <option value="Захиргаа">Удирдлага</option>
                <option value="Хүний нөөц">Захиргаа</option>
                <option value="ХАБЭАБО">ГХБ</option>
                <option value="Уулын хэлтэс">Засвар</option>
                <option value="Тэсэлгээний хэлтэс">ХАБЭАБО</option>
                <option value="Удирдлага">IT</option>
                <option value="Санхүү">Санхүү</option>
                <option value="Бусад">Бусад</option>
              </select>
            </Field>

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
                <option>Улаанбаатар-Даланзадгад</option>
                <option>Улаанбаатар-Шивээхүрэн /сайт/</option>
                <option>Улаанбаатар-Баянхонгор</option>
                <option>Улаанбаатар-Хотгор уурхай</option>
                <option>Даланзадгад-Улаанбаатар</option>
                <option>Даланзадгад-Шивээхүрэн /сайт/</option>
                <option>Шивээхүрэн /сайт/-Даланзадгад</option>
                <option>Шивээхүрэн /сайт/-Улаанбаатар</option>
                <option>Цагаанхад-Шивээхүрэн /сайт/</option>
                <option>Цагаанхад-Хотгор уурхай</option>
                <option>Шивээхүрэн /сайт/-Цагаанхад</option>
                <option>Хотгор уурхай-Цагаанхад</option>
                <option>Бусад</option>
              </select>
            </Field>

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

          <Section step={2} icon={Truck} title="Тээврийн хэрэгсэл">
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

            {!isPublicTransport && (<>
            <div className="twoCols">
            <Field label="Жолоочийн нэр *">
              <input
                required
                name="driver"
                value={form.driver}
                onChange={updateForm}
                placeholder="Жишээ: Бат"
              />
            </Field>
            <Field label="Жолоочийн утасны дугаар *">
              <input
                required
                name="driverPhone"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]+"
                value={form.driverPhone}
                onChange={(e) => setForm({ ...form, driverPhone: e.target.value.replace(/[^0-9]/g, "") })}
                placeholder="Жишээ: 99112233"
              />
            </Field>
            </div>

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
            </Field>
            </div>
            </>)}
          </Section>

          <Section
            step={3}
            icon={Users}
            title="Зорчих ажилтан"
            badge={`${employees.length} / 4`}
            hint="Хамгийн ихдээ 4 ажилтан бүртгэх боломжтой."
          >
            {employees.map((employee, index) => (
              <div className="employeeCard" key={index}>
                <div className="employeeHead">
                  <span className="employeeTag">
                    <span className="employeeNum">{index + 1}</span>
                    Ажилтан
                  </span>
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

          <Section step={4} icon={ShieldCheck} title="Аюулгүй ажиллагааны зааварчилгаа">
            <div className="readRow">
              <button
                type="button"
                className={`safetyToggle${showSafety ? " open" : ""}`}
                aria-expanded={showSafety}
                onClick={() => setShowSafety(!showSafety)}
              >
                <span className="safetyToggleIcon" aria-hidden="true">
                  <ShieldCheck size={20} />
                </span>
                <span className="safetyToggleText">
                  <strong>Зааварчилгаа унших</strong>
                  <small>Хувийн аюулгүй байдал, аяллын аюулгүй байдал, хүнсний эрүүл ахуй</small>
                </span>
                <ChevronDown className="chevron" size={20} aria-hidden="true" />
              </button>

              <button
                type="button"
                className="safetyDownload"
                onClick={() => setShowReader(true)}
              >
                <FileText size={18} aria-hidden="true" />
                <span>Зааварчилгаа PDF унших</span>
              </button>
            </div>
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
                  <strong>
                    <PhoneCall size={16} aria-hidden="true" /> Яаралтай үед холбоо барих
                  </strong>
                  <div className="emergencyGrid">
                    <a href="tel:105"><small>Онцгой байдал</small>105</a>
                    <a href="tel:102"><small>Цагдаа</small>102</a>
                    <a href="tel:103"><small>Эмнэлэг</small>103</a>
                    <a href="tel:89018917"><small>Байгууллага</small>89018917</a>
                  </div>
                </div>
              </div>
            )}

            <div className="signatureBox">
              <div className="signatureHeader">
                <span>Гарын үсэг *</span>
                {signature && <span className="signatureOk"><CheckCircle2 size={15} /> Оруулсан</span>}
              </div>

              <label className={`signatureDrop${signature ? " hasImage" : ""}`}>
                <input type="file" accept="image/*" onChange={handleSignatureUpload} />
                {signature ? (
                  <>
                    <img className="signaturePreview" src={signature} alt="Signature preview" />
                    <span className="signatureChange">Өөр зураг сонгох</span>
                  </>
                ) : (
                  <span className="signaturePlaceholder">
                    <ImageUp size={26} aria-hidden="true" />
                    <strong>Зураг сонгох</strong>
                    <small>Гарын үсгийн зураг оруулна уу</small>
                  </span>
                )}
              </label>
            </div>

            <label className={`accept${accepted ? " checked" : ""}`}>
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
              {sending ? (
                <><Loader2 size={18} className="spin" aria-hidden="true" /> Илгээж байна...</>
              ) : (
                <><Send size={18} aria-hidden="true" /> Илгээх</>
              )}
            </button>
          </div>
        </form>
      </div>
      <Footer />
    </main>
  );
}

function Footer() {
  return (
    <footer className="siteFooter">
      Powered by <strong>Daniel Knight</strong>
    </footer>
  );
}

function Section({ step, icon: Icon, title, badge, hint, children }) {
  return (
    <section className="section">
      <div className="sectionTitle">
        <span className="sectionIcon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <div className="sectionHeading">
          <span className="sectionStep">Алхам {step}</span>
          <h2>{title}</h2>
          {hint && <p className="helper">{hint}</p>}
        </div>
        {badge && <span className="sectionBadge">{badge}</span>}
      </div>
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
