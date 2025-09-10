import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import mongoose from "mongoose";
import cron from "node-cron";
import axios from "axios";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MSG91 Configuration
const MSG91_API_KEY = '468361A22Letemv68c0b6e1P1';
const MSG91_SENDER_ID = 'HEALTH';

// MongoDB Connection
mongoose.connect("mongodb://localhost:27017/telemedicine", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => {
  console.log("MongoDB connected to telemedicine database");
});

// Schemas
const patientSchema = new mongoose.Schema({
  name: String,
  phoneNumber: String,
  age: Number,
  gender: String,
  createdAt: { type: Date, default: Date.now }
});

const prescriptionSchema = new mongoose.Schema({
  patientName: String,
  phoneNumber: String,
  doctorName: String,
  medicines: [{
    name: String,
    dosage: String,
    frequency: String,
    duration: String,
    times: [String]
  }],
  createdAt: { type: Date, default: Date.now }
});

const reminderSchema = new mongoose.Schema({
  prescriptionId: mongoose.Schema.Types.ObjectId,
  patientName: String,
  phoneNumber: String,
  medicineName: String,
  dosage: String,
  reminderTime: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const smsLogSchema = new mongoose.Schema({
  phoneNumber: String,
  message: String,
  status: String,
  response: Object,
  sentAt: { type: Date, default: Date.now }
});

const Patient = mongoose.model("Patient", patientSchema);
const Prescription = mongoose.model("Prescription", prescriptionSchema);
const Reminder = mongoose.model("Reminder", reminderSchema);
const SMSLog = mongoose.model("SMSLog", smsLogSchema);

// SMS Function
async function sendSimpleSMS(phoneNumber, message) {
  try {
    console.log(`Sending SMS to ${phoneNumber}: ${message}`);
    
    const response = await axios.post('https://api.msg91.com/api/sendhttp.php', null, {
      params: {
        authkey: MSG91_API_KEY,
        mobiles: `91${phoneNumber}`,
        message: message,
        sender: MSG91_SENDER_ID,
        route: 4,
        country: 91
      }
    });

    await SMSLog.create({
      phoneNumber: phoneNumber,
      message: message,
      status: 'success',
      response: response.data
    });

    console.log(`SMS sent successfully to ${phoneNumber}`);
    return { success: true, response: response.data };
    
  } catch (error) {
    console.error(`SMS failed for ${phoneNumber}:`, error.message);
    
    await SMSLog.create({
      phoneNumber: phoneNumber,
      message: message,
      status: 'failed',
      response: { error: error.message }
    });

    return { success: false, error: error.message };
  }
}

// API Routes
app.post("/api/chat", async (req, res) => {
  try {
    const { message, language } = req.body;
    console.log(`Received message: ${message} in language: ${language}`);
    
    let response = "I understand. How can I help you with your health concerns?";
    
    if (language === "hi") {
      response = "मैं समझ गया। आपकी स्वास्थ्य संबंधी चिंताओं में मैं कैसे मदद कर सकता हूं?";
    } else if (language === "pa") {
      response = "ਮੈਂ ਸਮਝ ਗਿਆ। ਤੁਹਾਡੀ ਸਿਹਤ ਸੰਬੰਧੀ ਚਿੰਤਾਵਾਂ ਵਿੱਚ ਮੈਂ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?";
    }

    res.json({ response });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/prescriptions", async (req, res) => {
  try {
    console.log("Received prescription data:", req.body);
    
    const { patientName, phoneNumber, doctorName, medicines } = req.body;
    
    // Validate required fields
    if (!patientName || !phoneNumber || !medicines || medicines.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields: patientName, phoneNumber, or medicines" 
      });
    }

    // Save prescription
    const prescription = new Prescription({
      patientName,
      phoneNumber,
      doctorName: doctorName || "Dr Mehta",
      medicines
    });
    
    const savedPrescription = await prescription.save();
    console.log(`Prescription saved for ${patientName} with ID: ${savedPrescription._id}`);

    // Create reminders for each medicine
    let reminderCount = 0;
    for (const medicine of medicines) {
      if (medicine.times && medicine.times.length > 0) {
        for (const time of medicine.times) {
          const reminder = new Reminder({
            prescriptionId: savedPrescription._id,
            patientName,
            phoneNumber,
            medicineName: medicine.name,
            dosage: medicine.dosage,
            reminderTime: time,
            isActive: true
          });
          
          await reminder.save();
          reminderCount++;
          console.log(`Reminder created: ${medicine.name} at ${time} for ${patientName}`);
        }
      }
    }

    res.json({ 
      success: true, 
      message: `Prescription saved successfully! ${reminderCount} reminders created.`,
      prescriptionId: savedPrescription._id,
      remindersCreated: reminderCount
    });
    
  } catch (error) {
    console.error("Error saving prescription:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: "Check server logs for more information"
    });
  }
});

app.get("/api/reminders", async (req, res) => {
  try {
    const reminders = await Reminder.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({ 
      success: true, 
      reminders,
      count: reminders.length 
    });
  } catch (error) {
    console.error("Error fetching reminders:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/reminders/disable", async (req, res) => {
  try {
    const { reminderId } = req.body;
    
    await Reminder.findByIdAndUpdate(reminderId, { isActive: false });
    
    res.json({ success: true, message: "Reminder disabled successfully" });
  } catch (error) {
    console.error("Error disabling reminder:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test SMS endpoint
app.post("/api/test-sms", async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    const result = await sendSimpleSMS(
      phoneNumber || "8094051891", 
      message || "Test message from telemedicine app - System working!"
    );
    
    res.json({ success: true, result });
  } catch (error) {
    console.error("Test SMS error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get SMS logs
app.get("/api/sms-logs", async (req, res) => {
  try {
    const logs = await SMSLog.find().sort({ sentAt: -1 }).limit(20);
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Medicine reminder cron job - runs every minute
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    
    console.log(`Checking reminders at ${currentTime}...`);
    
    const dueReminders = await Reminder.find({
      reminderTime: currentTime,
      isActive: true
    });

    if (dueReminders.length > 0) {
      console.log(`Found ${dueReminders.length} due reminders`);
      
      for (const reminder of dueReminders) {
        const message = `Medicine Reminder: Take ${reminder.medicineName} ${reminder.dosage} now. Stay healthy! - Telemedicine Nabha`;
        
        // Send SMS
        const smsResult = await sendSimpleSMS(reminder.phoneNumber, message);
        
        if (smsResult.success) {
          console.log(`Reminder sent to ${reminder.patientName} (${reminder.phoneNumber})`);
        } else {
          console.error(`Failed to send reminder to ${reminder.patientName}`);
        }
      }
    } else {
      console.log(`No reminders due at ${currentTime}`);
    }
    
  } catch (error) {
    console.error('Cron job error:', error);
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`MongoDB connected to telemedicine database`);
  console.log(`Medicine reminder cron job is active (checking every minute)`);
  console.log(`SMS Service: MSG91 Real SMS`);
});