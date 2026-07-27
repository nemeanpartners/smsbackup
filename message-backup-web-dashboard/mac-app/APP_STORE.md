# Mac App Store Notes

This repo now supports three macOS distribution paths:

- `npm run dist` for the existing DMG build
- `npm run dist:mas-dev` for a sandboxed development-signed Mac App Store build
- `npm run dist:mas` for the production Mac App Store build

## What changed

- The app no longer depends on auto-reading `~/Library/Messages/chat.db`.
- The app now uses Finder open/save dialogs for sandbox-safe access.
- Mac App Store builds request security-scoped bookmarks for the selected input and output files.
- Electron Builder is configured with `mas` and `mas-dev` targets plus MAS entitlements.

## Why this is required

Mac App Store apps must run with App Sandbox enabled. That means the app cannot depend on broad filesystem access like Full Disk Access or silent reads of protected folders. The App Store-safe pattern is user-selected files through the standard macOS open/save panels.

## Build prerequisites

1. Use a real bundle identifier you control in Apple Developer and App Store Connect.
2. Install Apple certificates in Keychain:
   - `Apple Development`
   - `Apple Distribution`
3. Create matching macOS provisioning profiles for:
   - development testing (`mas-dev`)
   - App Store distribution (`mas`)
4. Make sure Electron Builder can find those identities and profiles on this Mac.

## Expected outputs

- `npm run dist:mas-dev`
  Produces a local MAS-style build for sandbox testing on provisioned machines.
- `npm run dist:mas`
  Produces the App Store submission artifact to upload to App Store Connect.

## Remaining manual submission work

- Add a real macOS app icon (`.icns`). This repo currently has no custom macOS icon asset.
- Verify the bundle identifier, app name, and company metadata in App Store Connect.
- Test the `mas-dev` build end-to-end on the target Mac before uploading.
- Upload the final Mac App Store package with Transporter or App Store Connect tooling.

## Product behavior change

The Mac App Store version should instruct users to choose `chat.db` manually. If the file is inside a protected location and macOS blocks direct selection, the user may need to copy `chat.db` to another folder first and then select that copy.
