import express from "express";
import fs from "fs";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Ensure data folder exists
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CONFIG_PATH = path.join(DATA_DIR, "form_config.json");
const SUBMISSIONS_PATH = path.join(DATA_DIR, "submissions.json");
const TELEGRAM_CONFIG_PATH = path.join(DATA_DIR, "telegram_config.json");

// Default Arabic Form Configuration for Al-Kooh Culture NGO (extracted from form image)
const DEFAULT_CONFIG = {
  title: "استمارة تجديد الهوية - منظمة الكوخ الثقافية",
  description: "منظمة غير حكومية مجازة ومسجلة رسمياً بالأمانة العامة لمجلس الوزراء في العراق. يرجى ملء المعلومات المطلوبة وإرفاق صورتك الشخصية لتجديد العضوية وطباعة الوصل الإلكتروني مباشرة.",
  theme: "indigo",
  headerNote: "منظمة الكوخ الثقافية - AL-KOOKH CULTURAL NGO",
  logoSeed: "standard",
  fields: [
    {
      id: "personal_photo",
      label: "الصورة الشخصية الحديثة للمتقدم",
      type: "image",
      placeholder: "اسحب صورتك الشخصية بخلفية بيضاء هنا أو انقر لتحديد صورة من جهازك",
      required: true
    },
    {
      id: "full_name",
      label: "الاسم الرباعي واللقب",
      type: "text",
      placeholder: "أدخل اسمك الرباعي الكامل كما هو مثبت في البطاقة الوطنية الموحدة",
      required: true
    },
    {
      id: "expired_id_number",
      label: "رقم الهوية المنتهية",
      type: "text",
      placeholder: "أدخل رقم هوية العضوية السابقة المنتهية لتأكيد السجل",
      required: true
    },
    {
      id: "first_joined_date",
      label: "تاريخ الانتماء لأول مرة",
      type: "date",
      required: true
    },
    {
      id: "specialization",
      label: "الاختصاص",
      type: "text",
      placeholder: "مثال: فنون جميلة، مسرح، برمجيات، إدارة، تربية",
      required: true
    },
    {
      id: "national_card_front",
      label: "شريط البطاقة الوطنية الموحدة (الوجه الأمامي)",
      type: "image",
      placeholder: "اسحب صورة الوجه الأمامي للبطاقة الوطنية الموحدة هنا أو انقر لالتقاطها بالمثبت",
      required: true
    },
    {
      id: "national_card_back",
      label: "شريط البطاقة الوطنية الموحدة (الوجه الخلفي)",
      type: "image",
      placeholder: "اسحب صورة الوجه الخلفي للبطاقة الوطنية الموحدة هنا أو انقر لالتقاطها بالمثبت",
      required: true
    },
    {
      id: "housing_card_front",
      label: "بطاقة السكن (الوجه الأمامي)",
      type: "image",
      placeholder: "اسحب صورة الوجه الأمامي لبطاقة السكن أو انقر لالتقاطها بالكاميرا تلقائياً",
      required: true
    },
    {
      id: "housing_card_back",
      label: "بطاقة السكن (الوجه الخلفي)",
      type: "image",
      placeholder: "اسحب صورة الوجه الخلفي لبطاقة السكن أو انقر لالتقاطها بالكاميرا تلقائياً",
      required: true
    },
    {
      id: "fine_arts_graduate",
      label: "هل أنت خريج معهد الفنون الجميلة أو كلية الفنون الجميلة؟",
      type: "select",
      options: ["نعم، أنا خريج (معهد/كلية) الفنون الجميلة", "لا، لست خريجاً بالترتيب الفني"],
      required: true
    },
    {
      id: "graduation_doc",
      label: "صورة تأييد التخرج (اختياري للخريجين الفنيين)",
      type: "image",
      placeholder: "مستند تأييد التخرج أو وثيقة التخرج كصورة (اختياري)",
      required: false
    },
    {
      id: "payment_receipt",
      label: "وصل الدفع الإلكتروني المعتمر والرسوم",
      type: "image",
      placeholder: "اسحب صورة وصل الدفع الإلكتروني هنا أو انقر لرفعها لتأكيد الرسوم",
      required: true
    },
    {
      id: "past_contributions",
      label: "المشاركات والاعمال خلال السنة السابقة (تكتب خمس مشاركات على الأقل)",
      type: "textarea",
      placeholder: "أذكر هنا خمسة أعمال أو مشاركات تطوعية قمت بها في كنف المنظمة سابقاً بمحاذاة تامة لتجديد العضوية",
      required: true
    }
  ]
};

// Initialize configuration file or overwrite old placeholder config
let shouldWriteConfig = !fs.existsSync(CONFIG_PATH);
if (fs.existsSync(CONFIG_PATH)) {
  try {
    const existing = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    if (existing.title === "استمارة التقديم والتوظيف الإلكترونية" || !existing.fields.some((f: any) => f.id === "national_card_front")) {
      shouldWriteConfig = true; // Overwrite outdated configs to adopt Al-Kooh template & expanded fields
    }
  } catch (e) {
    shouldWriteConfig = true;
  }
}

if (shouldWriteConfig) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
}
// Initialize submissions file if it doesn't exist
if (!fs.existsSync(SUBMISSIONS_PATH)) {
  fs.writeFileSync(SUBMISSIONS_PATH, JSON.stringify([], null, 2), "utf-8");
}

// Initialize telegram config file if it doesn't exist
if (!fs.existsSync(TELEGRAM_CONFIG_PATH)) {
  const defaultTelegram = {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.TELEGRAM_CHAT_ID || "",
    enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
  };
  fs.writeFileSync(TELEGRAM_CONFIG_PATH, JSON.stringify(defaultTelegram, null, 2), "utf-8");
}

// Helpers of files reading/writing
function readFormConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    return DEFAULT_CONFIG;
  }
}

function writeFormConfig(config: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

function readSubmissions(): any[] {
  try {
    const raw = fs.readFileSync(SUBMISSIONS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

function writeSubmissions(submissions: any[]) {
  fs.writeFileSync(SUBMISSIONS_PATH, JSON.stringify(submissions, null, 2), "utf-8");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ limit: "20mb", extended: true }));

  // Initialize Gemini client using server guidelines
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: geminiApiKey || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // 1. Get current form configuration
  app.get("/api/form-config", (req, res) => {
    try {
      res.json(readFormConfig());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. Save customized form configuration manually
  app.post("/api/form-config", (req, res) => {
    try {
      const newConfig = req.body;
      if (!newConfig.title || !newConfig.fields) {
        return res.status(400).json({ error: "العنوان والحقول مطلوبة لتحديث الاستمارة" });
      }
      writeFormConfig(newConfig);
      res.json({ success: true, config: newConfig });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3. AI Form Creator: Generates Form Fields from Description text
  app.post("/api/ai/generate-form", async (req, res) => {
    try {
      const { description } = req.body;
      if (!description) {
        return res.status(400).json({ error: "الرجاء توفير وصف الاستمارة لكي يقوم الذكاء الاصطناعي ببنائها" });
      }

      if (!geminiApiKey) {
        return res.status(400).json({
          error: "لم يتم العثور على مفتاح API الخاص بـ Gemini. يرجى تهيئة المفتاح في لوحة الأسرار (Secrets)."
        });
      }

      const prompt = `أنت مصمم استمارات إلكترونية خبير ومحترف. قم ببناء استمارة إلكترونية إحترافية تناسب الوصف التالي بذكاء ودقة:
"${description}"

قم باستخراج عنوان مناسب للاستمارة، ووصف قصير، والحقول المطلوبة بدقة مع أنواعها المناسبة (text, number, email, tel, date, select, textarea).
تأكد من أن أسماء الحقول والمعرّفات (ids) مكتوبة باللغة الإنجليزية لتكون متجانسة برمجياً ومميزة (unique) وخالية من الرموز الخاصة مثل: full_name, birth_date, email, phone, gender... إلخ.
بالنسبة لحقول select، قم بتزويد قائمة خيارات (options) مناسبة مكتوبة باللغة العربية باحترافية.
اختر لوناً سمةً جميلاً ومناسباً للأجواء (أحد الألوان المسموح بها فقط: emerald, indigo, slate, amber, cyan).
قم بتحديد حقل إضافي "headerNote" يعطي شعوراً رسمياً للاستمارة مثل "جمهورية العراق - استمارة كذا" أو "مؤسسة كذا - طلب حجز".`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: "العنوان الرئيسي للاستمارة باللغة العربية"
              },
              description: {
                type: Type.STRING,
                description: "وصف توضيحي للاستمارة يحث المتقدمين على تعبئة البيانات"
              },
              theme: {
                type: Type.STRING,
                description: "السمة اللونية، يجب أن تكون قيمة واحدة من هذه اللائحة تماماً: emerald, indigo, slate, amber, cyan"
              },
              headerNote: {
                type: Type.STRING,
                description: "عنوان رسمي علوي للترويسة"
              },
              logoSeed: {
                type: Type.STRING,
                description: "رمز الشعار المناسب، يفضل اختيار واحد من: government, school, company, medical, standard"
              },
              fields: {
                type: Type.ARRAY,
                description: "مجموعة الحقول المطلوبة لتغطية احتياجات الاستمارة بشكل كامل",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: {
                      type: Type.STRING,
                      description: "معرّف برمجي قصير فريد كلياً مكتوب بالإنجليزية بأحرف صغيرة وخط سفلي فقط، مثال: full_name"
                    },
                    label: {
                      type: Type.STRING,
                      description: "اسم الحقل الظاهر للمستخدم بالعربية بأسلوب رسمي وواضح، مثال: الاسم الكامل واللقب"
                    },
                    type: {
                      type: Type.STRING,
                      description: "نوع الحقل، يجب أن يكون حرفياً واحد من: text, number, email, tel, date, select, textarea"
                    },
                    placeholder: {
                      type: Type.STRING,
                      description: "ملاحظة توضيحية أو إرشادية داخل حقل الإدخال باللغة العربية لتسهيل الكتابة"
                    },
                    required: {
                      type: Type.BOOLEAN,
                      description: "هل الحقل إلزامي لإتمام إرسال الاستمارة؟"
                    },
                    options: {
                      type: Type.ARRAY,
                      description: "مجموعة الخيارات باللغة العربية، مطلوبة ومكتملة فقط إذا كان النوع select، وإلا تترك فارغة",
                      items: {
                        type: Type.STRING
                      }
                    }
                  },
                  required: ["id", "label", "type", "required"]
                }
              }
            },
            required: ["title", "description", "fields", "theme"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("لم يقم الذكاء الاصطناعي بإرجاع نتيجة صحيحة.");
      }

      const generatedConfig = JSON.parse(responseText.trim());
      
      // Keep defaults for fields if missing
      generatedConfig.theme = ["emerald", "indigo", "slate", "amber", "cyan"].includes(generatedConfig.theme) 
        ? generatedConfig.theme 
        : "emerald";

      res.json(generatedConfig);
    } catch (e: any) {
      console.error("AI Generation Error:", e);
      res.status(500).json({ error: e.message || "فشلت عملية التوليد بالذكاء الاصطناعي." });
    }
  });

  // Telegram Integration Helpers
  async function sendTelegramNotifications(config: any, submission: any) {
    try {
      if (!fs.existsSync(TELEGRAM_CONFIG_PATH)) return;
      const telConfig = JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_PATH, "utf-8"));
      if (!telConfig.enabled || !telConfig.botToken || !telConfig.chatId) {
        return;
      }

      const { botToken, chatId } = telConfig;
      const data = submission.data;

      // 1. Build beautiful HTML message
      let text = `<b>🏛️ استمارة تجديد العضوية الإلكترونية 🏛️</b>\n`;
      text += `<b>منظمة الكوخ الثقافية - AL-KOOKH NGO</b>\n`;
      text += `━━━━━━━━━━━━━━━━━━━\n\n`;
      text += `<b>👤 بيانات مقدم الطلب الكرّام:</b>\n`;
      
      // Check if Al-Kooh standard config to map premium labels, otherwise fallback
      const isAlKooh = config.fields.some((f: any) => f.id === 'national_card_front');
      
      if (isAlKooh) {
        text += `<b>🔸 الاسم الرباعي واللقب:</b> <code>${data.full_name || 'غير معروف'}</code>\n`;
        text += `<b>🔸 رقم الهوية المنتهية:</b> <code>${data.expired_id_number || 'غير متوفر'}</code>\n`;
        text += `<b>🔸 تاريخ الانتماء الأول:</b> <code>${data.first_joined_date || 'غير متوفر'}</code>\n`;
        text += `<b>🔸 الاختصاص المهني:</b> <code>${data.specialization || 'غير متوفر'}</code>\n`;
        text += `<b>🔸 خريج معهد/كلية الفنون:</b> <code>${data.fine_arts_graduate || 'غير متوفر'}</code>\n\n`;
        
        if (data.past_contributions) {
          text += `<b>📝 المشاركات والأعمال التطوعية (السنة السابقة):</b>\n<code>${data.past_contributions}</code>\n\n`;
        }
      } else {
        for (const field of config.fields) {
          if (field.type !== 'image' && data[field.id] !== undefined) {
            let displayVal = data[field.id];
            if (field.type === 'checkbox') {
              displayVal = displayVal ? '🟢 موافق ومؤكد' : '🔴 غير موافق';
            }
            text += `<b>🔸 ${field.label}:</b>\n${displayVal}\n\n`;
          }
        }
      }

      text += `━━━━━━━━━━━━━━━━━━━\n`;
      text += `<b>📊 حالة المستندات والمرفقات المرسلة أدناه:</b>\n`;
      text += `- الصورة الشخصية: ${data.personal_photo ? '🟢 مرفقة' : '🔴 لم ترفق'}\n`;
      text += `- البطاقة الوطنية (أمام): ${data.national_card_front ? '🟢 مرفقة' : '🔴 لم ترفق'}\n`;
      text += `- البطاقة الوطنية (خلف): ${data.national_card_back ? '🟢 مرفقة' : '🔴 لم ترفق'}\n`;
      text += `- بطاقة السكن (أمام): ${data.housing_card_front ? '🟢 مرفقة' : '🔴 لم ترفق'}\n`;
      text += `- بطاقة السكن (خلف): ${data.housing_card_back ? '🟢 مرفقة' : '🔴 لم ترفق'}\n`;
      if (data.fine_arts_graduate && String(data.fine_arts_graduate).includes('نعم')) {
        text += `- وثيقة التخرج: ${data.graduation_doc ? '🟢 مرفقة' : '🔴 مطلوب ولم ترفق'}\n`;
      } else {
        text += `- وثيقة التخرج: ${data.graduation_doc ? '🟢 مرفقة' : '⚪ غير مطلوبة'}\n`;
      }
      text += `- وصل الدفع الإلكتروني: <b>🟢 مرفق بـ (أولوية التحقق الأولى)</b>\n\n`;

      text += `━━━━━━━━━━━━━━━━━━━\n`;
      text += `<b>🔢 الرمز المرجعي:</b> <code>NGO-ALKOOKH-${submission.serialNumber}</code>\n`;
      text += `<b>📅 تاريخ التقديم:</b> <code>${new Date(submission.submittedAt).toLocaleString('ar-IQ')}</code>\n\n`;
      text += `<i>بوابة منظمة الكوخ الثقافية الإلكترونية الذكية 🤖</i>`;

      // Send Main Text Message to Telegram
      const textRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: "HTML"
        })
      });

      if (!textRes.ok) {
        console.error("Failed to send Telegram text message:", await textRes.text());
      }

      // 2. Scan and Send Photos separately to Telegram (With Receipt & Personal Photo prioritised!)
      const imageFields = config.fields.filter((field: any) => field.type === 'image' && data[field.id]);
      
      // Sort prioritising payment_receipt first, then personal_photo, then others
      imageFields.sort((a: any, b: any) => {
        if (a.id === 'payment_receipt') return -1;
        if (b.id === 'payment_receipt') return 1;
        if (a.id === 'personal_photo') return -1;
        if (b.id === 'personal_photo') return 1;
        return 0;
      });

      for (const field of imageFields) {
        const base64Str = data[field.id];
        if (typeof base64Str === 'string' && base64Str.startsWith('data:image/')) {
          try {
            const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) continue;

            const mimeType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');
            const blob = new Blob([buffer], { type: mimeType });

            const formData = new FormData();
            formData.append('chat_id', chatId);
            
            // Highlight payment_receipt in the caption
            let icon = '📁';
            let labelText = field.label;
            if (field.id === 'payment_receipt') {
              icon = '💵';
              labelText = `وصل الدفع الإلكتروني والرسوم (أولوية التحقق القصوى)`;
            } else if (field.id === 'personal_photo') {
              icon = '👤';
              labelText = `الصورة المعاملية الحديثة للمتقدم`;
            } else if (field.id.startsWith('national_')) {
              icon = '💳';
            } else if (field.id.startsWith('housing_')) {
              icon = '🏠';
            }
            
            formData.append('caption', `${icon} <b>${labelText}</b>\n👤 المتقدم: ${data.full_name || 'غير معروف'}\n🔢 الرقم: ${submission.serialNumber}`);
            formData.append('parse_mode', 'HTML');
            formData.append('photo', blob, `file.${mimeType.split('/')[1] || 'jpg'}`);

            const photoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
              method: "POST",
              body: formData
            });

            if (!photoRes.ok) {
              console.error(`Failed to send Telegram photo for ${field.id}:`, await photoRes.text());
            }
          } catch (imgErr) {
            console.error(`Error processing/sending photo for ${field.id}:`, imgErr);
          }
        }
      }
    } catch (err) {
      console.error("Telegram notification main error:", err);
    }
  }

  // Get Telegram Config
  app.get("/api/telegram-config", (req, res) => {
    try {
      if (fs.existsSync(TELEGRAM_CONFIG_PATH)) {
        res.json(JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_PATH, "utf-8")));
      } else {
        res.json({ botToken: "", chatId: "", enabled: false });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save Telegram Config
  app.post("/api/telegram-config", (req, res) => {
    try {
      const { botToken, chatId, enabled } = req.body;
      const newConfig = { botToken: botToken || "", chatId: chatId || "", enabled: !!enabled };
      fs.writeFileSync(TELEGRAM_CONFIG_PATH, JSON.stringify(newConfig, null, 2), "utf-8");
      res.json({ success: true, config: newConfig });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 4. Submit form data (Insert submission)
  app.post("/api/submissions", (req, res) => {
    try {
      const submissionData = req.body;
      if (!submissionData || Object.keys(submissionData).length === 0) {
        return res.status(400).json({ error: "الرجاء توفير البيانات المطلوبة للإرسال" });
      }

      const submissions = readSubmissions();
      
      // Create a unique serial number
      const currentYear = new Date().getFullYear();
      const count = submissions.length + 1;
      const serialNumber = `EST-${currentYear}-${String(count).padStart(4, "0")}`;

      const newSubmission = {
        id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
        serialNumber,
        submittedAt: new Date().toISOString(),
        data: submissionData
      };

      submissions.unshift(newSubmission); // newest first
      writeSubmissions(submissions);

      // Async/Background notification to Telegram so submission is non-blocking
      const appConfig = readFormConfig();
      sendTelegramNotifications(appConfig, newSubmission).catch(err => {
        console.error("Background telegram notification scheduler err:", err);
      });

      res.json({ success: true, submission: newSubmission });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 5. Get list of all submissions
  app.get("/api/submissions", (req, res) => {
    try {
      res.json(readSubmissions());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 6. Delete a specific submission (Admin Cleaning)
  app.delete("/api/submissions/:id", (req, res) => {
    try {
      const { id } = req.params;
      const submissions = readSubmissions();
      const filtered = submissions.filter((sub) => sub.id !== id);
      writeSubmissions(filtered);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 7. Clear all submissions (Reset App)
  app.delete("/api/submissions", (req, res) => {
    try {
      writeSubmissions([]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Serve static UI assets inside Vite Dev Server / Prod Built server
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Form Server] is running beautifully on http://localhost:${PORT}`);
  });
}

startServer();
