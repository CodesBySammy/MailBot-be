const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// Function to replace placeholders in email template
function replacePlaceholders(template, data) {
    return template.replace(/{{([^}]+)}}/g, (match, key) => data[key.trim()] || match);
}

// Email Sending Endpoint
app.post('/send-emails', async (req, res) => {
    const { fromEmail, appPassword, subject, message, html, emails, fromName } = req.body;

    if (!fromEmail || !appPassword || !subject || !emails || emails.length === 0) {
        return res.status(400).json({ message: 'Missing required email fields' });
    }

    try {
        // Create email transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: fromEmail, pass: appPassword },
            tls: { rejectUnauthorized: false }
        });

        let results = [];
        const batchSize = 5;  // Number of emails per batch
        const delayBetweenBatches = 3000; // 3-second delay between batches

        for (let i = 0; i < emails.length; i += batchSize) {
            const batch = emails.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(async (emailData) => {
                try {
                    // Personalize email subject and body
                    const personalizedSubject = replacePlaceholders(subject, emailData);
                    const personalizedText = message ? replacePlaceholders(message, emailData) : '';
                    const personalizedHtml = html ? replacePlaceholders(html, emailData) : personalizedText;

                    const mailOptions = {
                        from: `"${fromName}" <${fromEmail}>`,
                        to: emailData.Email,
                        subject: personalizedSubject,
                        text: personalizedText,
                        html: html ? personalizedHtml : undefined
                    };

                    await transporter.sendMail(mailOptions);
                    return { email: emailData.Email, status: 'Success' };
                } catch (error) {
                    return { email: emailData.Email, status: 'Failed', error: error.message };
                }
            }));

            results.push(...batchResults);
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches)); // Wait before next batch
        }

        const summary = {
            total: results.length,
            success: results.filter(r => r.status === 'Success').length,
            failed: results.filter(r => r.status === 'Failed').length
        };

        res.json({
            message: `Email sending completed. ${summary.success}/${summary.total} emails sent successfully.`,
            summary,
            results
        });
    } catch (error) {
        res.status(500).json({ message: 'Critical email sending error', error: error.message });
    }
});

// Handle preflight requests
app.options('*', cors());

// Serve frontend
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app; // For Vercel deployment

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
