import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Simple decision tree chatbot (logic in English)
function chatbotLogic(message) {
  const msg = message.toLowerCase();

  if (msg.includes("fever") || msg.includes("bukhaar") || msg.includes("bukhar")) {
    return "Do you also have cough?";
  } else if (msg.includes("cough") || msg.includes("khansi") || msg.includes("khasi")) {
    return "You may have flu. Please consult a doctor.";
  } else if (msg.includes("headache") || msg.includes("sar dard") || msg.includes("sir dard")) {
    return "Are you feeling dizziness as well?";
  } else if (msg.includes("yes") || msg.includes("han") || msg.includes("haan")) {
    return "Please consult a doctor immediately. You may need medical attention.";
  } else if (msg.includes("no") || msg.includes("nahi") || msg.includes("nahin")) {
    return "Monitor your symptoms. Drink plenty of water and rest.";
  } else {
    return "I'm not sure about your symptoms. Please provide more details or consult a doctor.";
  }
}

// Manual translation for common responses (fallback)
const translations = {
  "Do you also have cough?": {
    "hi": "क्या आपको खांसी भी है?",
    "pa": "ਕੀ ਤੁਹਾਨੂੰ ਖੰਘ ਵੀ ਹੈ?"
  },
  "You may have flu. Please consult a doctor.": {
    "hi": "आपको फ्लू हो सकता है। कृपया डॉक्टर से सलाह लें।",
    "pa": "ਤੁਹਾਨੂੰ ਫਲੂ ਹੋ ਸਕਦਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਡਾਕਟਰ ਨਾਲ ਸਲਾਹ ਲਓ।"
  },
  "Are you feeling dizziness as well?": {
    "hi": "क्या आप चक्कर भी महसूस कर रहे हैं?",
    "pa": "ਕੀ ਤੁਸੀਂ ਚੱਕਰ ਵੀ ਮਹਿਸੂਸ ਕਰ ਰਹੇ ਹੋ?"
  },
  "Please consult a doctor immediately. You may need medical attention.": {
    "hi": "कृपया तुरंत डॉक्टर से सलाह लें। आपको चिकित्सा सहायता की आवश्यकता हो सकती है।",
    "pa": "ਕਿਰਪਾ ਕਰਕੇ ਤੁਰੰਤ ਡਾਕਟਰ ਨਾਲ ਸਲਾਹ ਲਓ। ਤੁਹਾਨੂੰ ਡਾਕਟਰੀ ਸਹਾਇਤਾ ਦੀ ਲੋੜ ਹੋ ਸਕਦੀ ਹੈ।"
  },
  "Monitor your symptoms. Drink plenty of water and rest.": {
    "hi": "अपने लक्षणों पर नज़र रखें। खूब पानी पिएं और आराम करें।",
    "pa": "ਆਪਣੇ ਲੱਛਣਾਂ ਤੇ ਨਜ਼ਰ ਰੱਖੋ। ਬਹੁਤ ਪਾਣੀ ਪੀਓ ਅਤੇ ਆਰਾਮ ਕਰੋ।"
  },
  "I'm not sure about your symptoms. Please provide more details or consult a doctor.": {
    "hi": "मुझे आपके लक्षणों के बारे में यकीन नहीं है। कृपया अधिक विवरण दें या डॉक्टर से सलाह लें।",
    "pa": "ਮੈਨੂੰ ਤੁਹਾਡੇ ਲੱਛਣਾਂ ਬਾਰੇ ਯਕੀਨ ਨਹੀਂ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਹੋਰ ਵੇਰਵੇ ਦਿਓ ਜਾਂ ਡਾਕਟਰ ਨਾਲ ਸਲਾਹ ਲਓ।"
  }
};

// Translate text to target language
async function translateText(text, targetLang) {
  if (targetLang === "en") return text;
  
  // First try manual translations
  if (translations[text] && translations[text][targetLang]) {
    return translations[text][targetLang];
  }
  
  // Try Google Translate API as fallback
  try {
    const { default: translate } = await import("@vitalets/google-translate-api");
    const result = await translate(text, { to: targetLang });
    return result.text;
  } catch (error) {
    console.warn("Translation failed:", error.message);
    return text; // Return original text if translation fails
  }
}

// API endpoint: chatbot with multilingual support
app.post("/chat", async (req, res) => {
  try {
    console.log("Received request:", req.body);
    
    const { message, lang } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Step 1: Translate user message to English (if needed)
    let translatedMessage = message;
    if (lang !== "en") {
      try {
        const { default: translate } = await import("@vitalets/google-translate-api");
        const translatedIn = await translate(message, { to: "en" });
        translatedMessage = translatedIn.text;
        console.log("Translated input to English:", translatedMessage);
      } catch (error) {
        console.warn("Input translation failed, using original:", error.message);
        // Try to process original message anyway
      }
    }

    // Step 2: Run chatbot logic in English
    const botResponseEn = chatbotLogic(translatedMessage);
    console.log("Bot response in English:", botResponseEn);
    
    // Step 3: Translate response to user's language
    const finalResponse = await translateText(botResponseEn, lang);
    console.log("Final response in", lang, ":", finalResponse);

    res.json({
      userMessage: message,
      botResponse: finalResponse,
    });
  } catch (err) {
    console.error("Error in /chat endpoint:", err);
    res.status(500).json({ 
      error: "Error processing chatbot request",
      details: err.message 
    });
  }
});

// Test endpoint
app.get("/test", (req, res) => {
  res.json({ message: "Server is working!" });
});

// Start server
app.listen(5000, () => {
  console.log("✅ Server running on http://localhost:5000");
  console.log("✅ Test endpoint: http://localhost:5000/test");
});