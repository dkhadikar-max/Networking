# Network Mobile App

React Native (Expo) mobile app for the Network platform.

## Setup

```bash
npm install
npx expo start
```

## Run on device
- **Android**: `npx expo start --android`  
- **iOS**:     `npx expo start --ios`
- **Expo Go**: Scan the QR code

## Backend
Connected to: `https://adequate-dedication-production-b992.up.railway.app`

## Auth
JWT tokens stored securely via `expo-secure-store`.

## Payment (Razorpay)
Install the native SDK for full payment support:
```bash
npm install react-native-razorpay
npx expo prebuild
```
