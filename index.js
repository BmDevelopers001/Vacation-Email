const express = require('express');
const { google } = require('googleapis');
const { authenticate } = require('@google-cloud/local-auth');
require('dotenv').config();

//Creating Express App;
const app = express();

// Setting Google OAuth credentials
const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URL
);

// Providing required Scopes for using Gmail Service
const scopes = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://mail.google.com/'
];

//Generating Authentication URL
app.post('/', async (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes
    });
    // console.log(url);
    res.send(url);
})

//Providing Authorization and other fuctionalities
app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;

    try {
        const { tokens } = await oauth2Client.getToken(code)
        oauth2Client.setCredentials(tokens);

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        //Get authenticated user's email address
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const emailAddress = profile.data.emailAddress;
        console.log('Email Address:', emailAddress);

        //Function for Labeling and sending auto replies
        main(gmail,res)

        //Function call for random interval between 45 to 120 seconds
        setInterval((gmail) => {
            main(gmail)   
        }, randomIntervalTime(45,120))
        
        res.send("Auto replying has running successfully");
    }
    catch (err) {
        console.log('Authentication error', err);
        res.status(500).send('Error while authenticating', err);
    }

})

async function main(gmail){
    let label;

    try {

        //Getting label data
        const labelList = await gmail.users.labels.list({ userId: 'me' });
        const labels = labelList.data.labels;
        label = labels.find(label => label.name === 'AutoReplied');

        if (!label) {

            //creating a new label
            label = await gmail.users.labels.create({
                userId: 'me',
                requestBody: {
                    name: 'AutoReplied',
                    labelListVisibility: 'labelShow',
                    messageListVisibility: 'show',
                },
            });
            console.log(`${label.name} label created`);
        } else {
            console.log(`"${label.name}" label already created`);
        }

    }
    catch (err) {
        console.log('Error while getting label', err);
        // res.status(500).send('Error while getting label', err);
    }

    //Created a new set to track record of already send email replies
    const repliedEmails = new Set();

    try {

        //getting unread mails
        const mailResponse = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread',
        });

        const messages = mailResponse.data.messages;

        //Iterating over unread mails data for checking and auto replying
        for (const message of messages) {

            try {

                //Getting data for particular mail
                const email = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id,
                    format: 'full',
                });
                const headers = email.data.payload.headers;
                const fromHeader = headers.find(header => header.name.toLowerCase() === 'from');
                const senderEmail = fromHeader.value;

                //Checking if email is already auto replied
                if (repliedEmails.has(senderEmail)) {
                    console.log(`Already replied to ${senderEmail}`);
                    continue;
                } else {

                    //Applying the label to the message
                    await gmail.users.messages.modify({
                        userId: 'me',
                        id: message.id,
                        requestBody: {
                            addLabelIds: [label.id],
                        },
                    });
                    console.log(`Applied ${label.name} label to ${message.id}`);

                    //Sending auto reply to the mail
                    const autoReply = {
                        userId: 'me',
                        requestBody: {
                            raw: autoReplyPayload(email.data, senderEmail),
                        },
                        threadId: email.data.threadId, // Reply within the same thread
                    };
                    await gmail.users.messages.send(autoReply);
                    console.log('Auto replied to', senderEmail);
                    repliedEmails.add(senderEmail);
                }


            }
            catch (err) {
                console.log('Error while repeating labeling and sending auto-replting', err);
            }

        }

    }
    catch (err) {
        console.log('Error while getting unread emails', err);
    }

}

//Function to creating a template for auto reply and encoding
function autoReplyPayload(message, senderEmail) {
    const autoReplyMessage = `
    Hello, Greetings from my side.

    I hope you are doing well. Thank you for reaching out to me, but as of now I'm on vacation. So, I'll get back to you as soon as possible.
    
    Thank You,
    bmsavaliya001@gmail.com
  `;

    const encodedMessage = Buffer.from(autoReplyMessage).toString('base64');

    // Get the recipient email address
    const headers = message.payload.headers;
    const toHeader = headers.find(header => header.name.toLowerCase() === 'to');
    const recipientEmail = toHeader.value;

    // Create the auto reply message with the recipient address
    const autoReply = `To: ${senderEmail}\r\n`
        + `Subject: Auto Reply\r\n`
        + `Content-Type: text/plain; charset=utf-8\r\n\r\n`
        + autoReplyMessage;

    const encodedAutoReply = Buffer.from(autoReply).toString('base64');
    return encodedAutoReply;
}

// Function for getting a random interval value between 45 to 120 seconds
function randomIntervalTime(min, max) {
    return (Math.floor(Math.random() * (max - min + 1)) + min) * 1000;
}

// Express server listening on port 8000
app.listen(8000, () => {
    console.log('Listening on port 8000');
})

