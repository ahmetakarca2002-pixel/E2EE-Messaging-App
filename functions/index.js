/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.sendNotificationOnNewMessage = functions.firestore
    .document('chats/{chatId}')
    .onUpdate((change, context) => {
        const newMessages = change.after.data().messages;
        const previousMessages = change.before.data().messages;

        if (newMessages.length > previousMessages.length) {
            const newMessage = newMessages[newMessages.length - 1];
            const senderId = newMessage.user._id;
            const receiverId = newMessage.user._id === newMessage.user._id ? 'receiverId' : newMessage.user._id; // Alıcı ID'si alınmalı

            // Alıcının FCM token'ını al
            return admin.firestore().collection('users').doc(receiverId).get()
                .then(doc => {
                    const fcmToken = doc.data().fcmToken;

                    const payload = {
                        notification: {
                            title: `${newMessage.user.name} yeni bir mesaj gönderdi`,
                            body: newMessage.text,
                            sound: 'default',
                        },
                    };

                    // Bildirimi gönder
                    return admin.messaging().sendToDevice(fcmToken, payload);
                })
                .catch(error => {
                    console.error('Error sending notification:', error);
                });
        }

        return null;
    });
