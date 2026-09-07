/**
 * Core send logic for the travel-safety form.
 *
 * Shared by the Vercel serverless function (api/send.js) and the local dev
 * middleware in vite.config.js, so both environments behave identically.
 *
 * Files prefixed with "_" are not routed by Vercel.
 */

const DEFAULT_RECIPIENTS = ["it@gkllc.mn", "admin@gkllc.mn", "share@gkllc.mn"];

// Resend only delivers to arbitrary addresses from a verified domain.
const DEFAULT_FROM = "Аяллын маягт <onboarding@resend.dev>";

// Keep well under Vercel's 4.5MB request body limit.
const MAX_SIGNATURE_BYTES = 3 * 1024 * 1024;

const SIGNATURE_CID = "signature";

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function recipients() {
  const configured = (process.env.MAIL_TO || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_RECIPIENTS;
}

async function buildPdfBuffer(form, employees, signature) {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const buffers = [];
  doc.on("data", (d) => buffers.push(d));

  doc.fontSize(16).text("Аяллын аюулгүй ажиллагааны зааварчилгаа", { align: "center" });
  doc.moveDown();

  const addRow = (label, value) => {
    doc.fontSize(11).fillColor("black").text(`${label}: `, { continued: true, width: 150 });
    doc.fontSize(11).fillColor("black").text(value || "-");
  };

  addRow("Компани", form.company);
  addRow("Харьяалагдах хэлтэс", form.department);
  addRow("Аялах өдөр", form.travelDate);
  addRow("Аялах чиглэл", form.direction === "Бусад" ? form.otherDirection : form.direction);
  addRow("Тээврийн хэрэгсэл", form.transport);
  addRow("Жолооч", form.driver || "-");
  addRow("Автомашин", form.vehicle || "-");

  doc.moveDown();
  employees.forEach((employee, idx) => {
    doc.fontSize(12).fillColor("black").text(`Ажилтан ${idx + 1}`, { underline: true });
    addRow("Овог нэр", employee.name);
    addRow("Албан тушаал", employee.position);
    addRow("Утас", employee.phone);
    doc.moveDown();
  });

  if (signature && signature.buffer) {
    try {
      doc.addPage();
      doc.fontSize(12).text("Гарын үсэг:");
      doc.image(signature.buffer, { fit: [400, 200], align: "left" });
    } catch (e) {
      // ignore if embedding fails
    }
  }

  doc.end();

  await new Promise((res) => doc.on("end", res));
  return Buffer.concat(buffers);
}

async function ensureYearMonthFolder(drive, parentFolderId) {
  // Determine year and month names using Asia/Ulaanbaatar timezone.
  const now = new Date();
  const year = new Intl.DateTimeFormat("en", { timeZone: "Asia/Ulaanbaatar", year: "numeric" }).format(now);
  const monthName = new Intl.DateTimeFormat("en", { timeZone: "Asia/Ulaanbaatar", month: "long" }).format(now);

  // Find or create year folder under parent
  const qYear = `name = '${year}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  let res = await drive.files.list({ q: qYear, fields: "files(id,name)", spaces: "drive" });
  let yearFolderId;
  if (res.data.files && res.data.files.length > 0) {
    yearFolderId = res.data.files[0].id;
  } else {
    const createdYear = await drive.files.create({
      requestBody: { name: year, mimeType: "application/vnd.google-apps.folder", parents: [parentFolderId] },
      fields: "id"
    });
    yearFolderId = createdYear.data.id;
  }

  // Find or create month folder under year folder
  const qMonth = `name = '${monthName}' and '${yearFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  res = await drive.files.list({ q: qMonth, fields: "files(id,name)", spaces: "drive" });
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;

  const createdMonth = await drive.files.create({
    requestBody: { name: monthName, mimeType: "application/vnd.google-apps.folder", parents: [yearFolderId] },
    fields: "id"
  });
  return createdMonth.data.id;
}

async function uploadBufferToDrive(drive, buffer, filename, folderId) {
  const { PassThrough } = await import("stream");
  const stream = new PassThrough();
  stream.end(buffer);

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId], mimeType: "application/pdf" },
    media: { mimeType: "application/pdf", body: stream },
    fields: "id"
  });

  return res.data.id;
}

/** Turns a data URL from the browser into an email attachment. */
function parseSignature(signature) {
  if (typeof signature !== "string" || !signature.startsWith("data:")) {
    return { error: "Гарын үсэг буруу форматтай байна." };
  }

  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(signature);
  if (!match) {
    return { error: "Гарын үсэг зөвхөн зураг байх ёстой." };
  }

  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");

  if (buffer.length === 0) {
    return { error: "Гарын үсгийн зураг хоосон байна." };
  }
  if (buffer.length > MAX_SIGNATURE_BYTES) {
    return { error: "Гарын үсгийн зураг хэт том байна. Жижиг зураг сонгоно уу." };
  }

  const extension = contentType.split("/")[1].replace("jpeg", "jpg").replace("+xml", "");

  return { base64, buffer, contentType, filename: `garyn-useg.${extension}` };
}

function validate(form, employees) {
  const missing = [];

  if (!form.department?.trim()) missing.push("Харьяалагдах хэлтэс");
  if (!form.travelDate) missing.push("Аялах өдөр");
  if (!form.direction) missing.push("Аялах чиглэл");
  if (form.direction === "Бусад" && !form.otherDirection?.trim()) missing.push("Бусад явах чиглэл");
  if (!form.transport?.trim()) missing.push("Аялах тээврийн хэрэгсэл");

  if (employees.length === 0) missing.push("Зорчих ажилтан");

  employees.forEach((employee, index) => {
    if (!employee?.name?.trim()) missing.push(`Ажилтан ${index + 1} - Овог нэр`);
    if (!employee?.position?.trim()) missing.push(`Ажилтан ${index + 1} - Албан тушаал`);
    if (!employee?.phone?.trim()) missing.push(`Ажилтан ${index + 1} - Утасны дугаар`);
  });

  return missing;
}

function buildHtml(form, employees, hasSignature) {
  const row = (label, value) => `
        <tr>
          <td style="padding:8px 12px; background:#f9fafb; border:1px solid #e5e7eb; width:200px; vertical-align:top;">${esc(label)}</td>
          <td style="padding:8px 12px; border:1px solid #e5e7eb;">${esc(value) || "-"}</td>
        </tr>`;

  const employeeRows = employees
    .map(
      (employee, index) => `
        <tr>
          <td colspan="2" style="padding:10px 12px; background:#eef2ff; border:1px solid #e5e7eb; font-weight:700;">Ажилтан ${index + 1}</td>
        </tr>${row("Овог нэр", employee.name)}${row("Албан тушаал", employee.position)}${row("Утасны дугаар", employee.phone)}`
    )
    .join("");

  const direction = form.direction === "Бусад" ? form.otherDirection : form.direction;

  const signatureCell = hasSignature
    ? `<img src="cid:${SIGNATURE_CID}" alt="Гарын үсэг" style="max-width:260px; max-height:140px; border:1px solid #d1d5db; border-radius:6px; background:#ffffff;" />
             <div style="margin-top:6px; font-size:12px; color:#6b7280;">Зураг харагдахгүй бол хавсралтаас үзнэ үү.</div>`
    : "Ороогүй";

  return `<!doctype html>
<html lang="mn">
  <body style="margin:0; padding:24px; background:#f3f4f6; font-family:Arial,Helvetica,sans-serif; color:#111827;">
    <div style="max-width:720px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden;">
      <div style="padding:20px 24px; background:#1e3a8a; color:#ffffff;">
        <div style="font-size:18px; font-weight:700;">АТҮТ болон замын унаагаар зорчих үеийн</div>
        <div style="font-size:18px; font-weight:700;">аюулгүй ажиллагааны зааварчилгаа</div>
      </div>

      <div style="padding:24px;">
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:14px;">
          ${row("Компани", form.company)}
          ${row("Харьяалагдах хэлтэс", form.department)}
          ${row("Аялах өдөр", form.travelDate)}
          ${row("Аялах чиглэл", direction)}
          ${row("Тээврийн хэрэгсэл", form.transport)}
          ${row("Жолооч", form.driver)}
          ${row("Автомашин", form.vehicle)}
          ${employeeRows}
          <tr>
            <td colspan="2" style="padding:10px 12px; background:#eef2ff; border:1px solid #e5e7eb; font-weight:700;">Баталгаажуулалт</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; background:#f9fafb; border:1px solid #e5e7eb; vertical-align:top;">Танилцсан эсэх</td>
            <td style="padding:8px 12px; border:1px solid #e5e7eb;">Дээрх шаардлагыг бүрэн уншиж танилцсан, ойлгосон бөгөөд мөрдөхөө зөвшөөрсөн.</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; background:#f9fafb; border:1px solid #e5e7eb; vertical-align:top;">Гарын үсэг</td>
            <td style="padding:12px; border:1px solid #e5e7eb;">${signatureCell}</td>
          </tr>
        </table>

        <p style="margin:20px 0 0; font-size:12px; color:#6b7280;">
          Энэ мэдэгдлийг аяллын зааварчилгааны маягт автоматаар илгээв.
        </p>
      </div>
    </div>
  </body>
</html>`;
}

function buildText(form, employees) {
  const direction = form.direction === "Бусад" ? form.otherDirection : form.direction;

  const lines = [
    "Аяллын аюулгүй ажиллагааны зааварчилгаа",
    "",
    `Компани: ${form.company}`,
    `Харьяалагдах хэлтэс: ${form.department}`,
    `Аялах өдөр: ${form.travelDate}`,
    `Аялах чиглэл: ${direction}`,
    `Тээврийн хэрэгсэл: ${form.transport}`,
    `Жолооч: ${form.driver || "-"}`,
    `Автомашин: ${form.vehicle || "-"}`,
    ""
  ];

  employees.forEach((employee, index) => {
    lines.push(
      `Ажилтан ${index + 1}: ${employee.name} | ${employee.position} | ${employee.phone}`
    );
  });

  lines.push("", "Гарын үсэг хавсралтад байна.");

  return lines.join("\n");
}

function buildSubject(form, employees) {
  const direction = form.direction === "Бусад" ? form.otherDirection : form.direction;
  const names = employees.map((employee) => employee.name).filter(Boolean).join(", ");

  return `Аяллын зааварчилгаа | ${form.travelDate} | ${direction} | ${names}`;
}

async function sendWithSmtp({ to, subject, html, text, signature }) {
  const nodemailer = (await import("nodemailer")).default;

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || (port === 465)) === "true";

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    // On the STARTTLS port, refuse to fall back to an unencrypted session
    // rather than sending the mailbox password in the clear.
    requireTLS: !secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    // Fail fast: a hung SMTP connection would otherwise run out the
    // serverless function's execution time with no useful error.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000
  });

  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    text,
    attachments: [
      {
        filename: signature.filename,
        content: signature.buffer,
        contentType: signature.contentType,
        cid: SIGNATURE_CID
      }
    ]
  });

  return info.messageId;
}

async function sendWithResend({ to, subject, html, text, signature }) {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: process.env.MAIL_FROM || DEFAULT_FROM,
    to,
    subject,
    html,
    text,
    attachments: [
      {
        filename: signature.filename,
        content: signature.base64,
        contentType: signature.contentType,
        contentId: SIGNATURE_CID
      }
    ]
  });

  if (error) {
    const detail = error.message || JSON.stringify(error);
    throw new Error(`Resend: ${detail}`);
  }

  return data?.id;
}

/**
 * Validates the submitted form and emails it to the configured recipients.
 * Returns a { status, body } pair the HTTP layer can send as-is.
 */
export async function sendFormMail(payload) {
  const form = payload?.form;
  const employees = Array.isArray(payload?.employees) ? payload.employees : [];

  if (!form || typeof form !== "object") {
    return { status: 400, body: { error: "Маягтын мэдээлэл дутуу байна." } };
  }

  const missing = validate(form, employees);
  if (missing.length > 0) {
    return { status: 400, body: { error: `Дутуу байна: ${missing[0]}` } };
  }

  const signature = parseSignature(payload?.signature);
  if (signature.error) {
    return { status: 400, body: { error: signature.error } };
  }

  const useSmtp = Boolean(process.env.SMTP_HOST);

  // smtp.gkllc.mn rejects unauthenticated senders, so treat missing
  // credentials as a configuration error instead of a delivery failure.
  if (useSmtp && !(process.env.SMTP_USER && process.env.SMTP_PASS)) {
    return {
      status: 500,
      body: { error: "SMTP хэрэглэгч болон нууц үг тохируулаагүй байна." }
    };
  }

  if (!useSmtp && !process.env.RESEND_API_KEY) {
    return {
      status: 500,
      body: { error: "Имэйл тохиргоо дутуу байна (RESEND_API_KEY эсвэл SMTP_HOST)." }
    };
  }

  const message = {
    to: recipients(),
    subject: buildSubject(form, employees),
    html: buildHtml(form, employees, true),
    text: buildText(form, employees),
    signature
  };

  try {
    const id = useSmtp ? await sendWithSmtp(message) : await sendWithResend(message);
    // After successful send, optionally create a PDF copy and upload to Drive.
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    const parentFolder = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // If any Google Drive var is present, require all four to proceed.
    if (clientId || clientSecret || refreshToken || parentFolder) {
      if (!(clientId && clientSecret && refreshToken && parentFolder)) {
        console.error("[api/send] Drive upload configured but missing one of GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, or GOOGLE_DRIVE_FOLDER_ID");
        return {
          status: 500,
          body: { error: "Drive upload misconfigured (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN and GOOGLE_DRIVE_FOLDER_ID)." }
        };
      }

      try {
        const pdfBuffer = await buildPdfBuffer(form, employees, signature);

        const { google } = await import("googleapis");
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const drive = google.drive({ version: "v3", auth: oauth2Client });

        const targetFolderId = await ensureYearMonthFolder(drive, parentFolder);

        const now = new Date();
        const dtf = new Intl.DateTimeFormat("en", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
        const parts = dtf.formatToParts(now).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
        const dateStr = `${parts.year}-${parts.month}-${parts.day}_${parts.hour}${parts.minute}`;
        const safeNames = employees.map((e) => (e.name || "").replace(/[^a-zA-Z0-9\u0080-\uFFFF_-]+/g, "_")).filter(Boolean);
        const namePart = safeNames.length ? safeNames.join("_") : "submission";
        const filename = `Travel_Request_${namePart}_${dateStr}.pdf`;

        await uploadBufferToDrive(drive, pdfBuffer, filename, targetFolderId);
      } catch (err) {
        console.error("[api/send] Drive upload failed:", err);
        return { status: 500, body: { error: `Drive upload failed: ${err.message || String(err)}` } };
      }
    }

    return { status: 200, body: { ok: true, id, to: message.to } };
  } catch (error) {
    console.error("[api/send] delivery failed:", error);
    return {
      status: 502,
      body: { error: "Имэйл илгээхэд алдаа гарлаа. Та дахин оролдоно уу." }
    };
  }
}
