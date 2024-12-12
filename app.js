const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration
const corsOptions = {
    origin: [
        'http://localhost:3000', 
        'https://mailbot-ten.vercel.app/' // Replace with your actual frontend domain
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// Function to replace template placeholders
function replacePlaceholders(template, data) {
    // Use regex to find {{placeholders}}
    return template.replace(/{{([^}]+)}}/g, (match, key) => {
        // Trim whitespace from the key and look for it in the data object
        const trimmedKey = key.trim();
        return data[trimmedKey] || match; // Return original match if key not found
    });
}

// Email Sending Endpoint
app.post('/send-emails', async (req, res) => {
    const { fromEmail, appPassword, subject, message, html, emails } = req.body;

    if (!fromEmail || !appPassword || !emails || emails.length === 0) {
        return res.status(400).json({ 
            message: 'Invalid input parameters' 
        });
    }

    try {
        // Create email transporter with improved configuration
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, // use TLS
            auth: {
                user: fromEmail,
                pass: appPassword
            },
            tls: {
                rejectUnauthorized: true
            }
        });

        const results = [];
        const batchSize = 3; // Reduced batch size for better deliverability
        const delayBetweenEmails = 5000; // 5-second delay between batches

        // Process emails in batches
        for (let i = 0; i < emails.length; i += batchSize) {
            const batch = emails.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(async (emailData) => {
                    // Personalize message and subject by replacing placeholders
                    const personalizedSubject = replacePlaceholders(subject, emailData);
                    const personalizedTextMessage = message 
                        ? replacePlaceholders(message, emailData) 
                        : '';
                    const personalizedHtmlMessage = html 
                        ? replacePlaceholders(html, emailData) 
                        : personalizedTextMessage;
                    
                    const mailOptions = {
                        from: {
                            name: 'Mozilla Firefox Club',
                            address: fromEmail
                        },
                        to: emailData.Email,
                        subject: personalizedSubject,
                        text: personalizedTextMessage,
                    };

                    // Only add html if it's provided
                    if (html) {
                        mailOptions.html = personalizedHtmlMessage;
                    }

                    try {
                        await transporter.sendMail(mailOptions);
                        return {
                            email: emailData.Email,
                            status: 'Success'
                        };
                    } catch (error) {
                        return {
                            email: emailData.Email,
                            status: 'Failed',
                            error: error.message
                        };
                    }
                })
            );

            results.push(...batchResults);

            // Delay between batches
            await new Promise(resolve => setTimeout(resolve, delayBetweenEmails));
        }

        // Generate summary
        const summary = {
            total: results.length,
            success: results.filter(r => r.status === 'Success').length,
            failed: results.filter(r => r.status === 'Failed').length
        };

        res.json({
            message: `Email sending completed. ${summary.success} out of ${summary.total} emails sent successfully.`,
            summary,
            results
        });
    } catch (error) {
        res.status(500).json({ 
            message: 'Critical error in email sending process', 
            error: error.message 
        });
    }
});

// Handle preflight requests
app.options('*', cors(corsOptions));

// Serve frontend
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app; // For Vercel
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
