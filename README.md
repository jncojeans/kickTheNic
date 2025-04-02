# Kick The Nic

A mobile application to help users quit nicotine addiction.

## iOS Deployment Guide

This guide will help you deploy the Kick The Nic application as a standalone iPhone application.

### Prerequisites

- An Apple Developer account
- Xcode installed on your Mac
- EAS CLI installed: `npm install -g eas-cli`
- Logged in to EAS: `eas login`

### Building for iOS

To build your application for iOS App Store distribution:

```bash
npm run build:ios
```

This command uses the `standalone-ios` profile defined in `eas.json` to create a production-ready build for the App Store.

### Submitting to App Store

Once your build is complete, you can submit it to the App Store:

```bash
npm run submit:ios
```

### Updating Your App (Over-the-Air Updates)

For minor updates that don't require a new App Store submission:

```bash
npm run update:ios
```

### Configuration Files

The following files contain the iOS-specific configuration:

- **eas.json**: Contains build profiles and submission settings
- **app.json**: Contains app metadata and iOS-specific settings
- **package.json**: Contains scripts for building and submitting

### App Store Connect Setup

1. Make sure your App ID (`6475963217`) is correctly set in `eas.json`
2. Ensure your Apple ID (`kevsjolinsched@gmail.com`) and Team ID (`KKUW8X6QXT`) are correctly set
3. Complete all App Store Connect requirements (screenshots, privacy policy, etc.)

### Troubleshooting

If you encounter build issues:

1. Check the EAS build logs
2. Verify your Apple Developer account has an active subscription
3. Ensure all certificates and provisioning profiles are valid

For more detailed information, refer to the [Expo documentation on EAS Build](https://docs.expo.dev/build/introduction/).