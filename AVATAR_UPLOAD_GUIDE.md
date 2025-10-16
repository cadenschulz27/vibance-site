# Profile Avatar Upload - Implementation Guide

## 🎨 Overview
Modern, secure avatar upload system with animated UX, file validation, and Firebase Storage integration.

---

## ✨ Features

### User Experience
- **Hover-to-Reveal Upload**: Button appears only on avatar hover
- **Animated Progress Indicator**: Visual feedback during upload
- **Instant Preview**: Image updates immediately after upload
- **Icon + Text Button**: Modern upload icon with clear label
- **File Validation**: Client-side checks before upload
- **Error Handling**: User-friendly error messages

### Security
- **Firebase Storage Rules**: Enforced at storage level
- **File Type Validation**: Only JPEG, PNG, WebP allowed
- **Size Limits**: Maximum 5MB per image
- **User Ownership**: Users can only modify their own avatars
- **Authenticated Access**: Must be logged in to upload/view

### Technical
- **Multiple Format Support**: JPEG, PNG, WebP
- **Smart File Naming**: Uses correct extension based on MIME type
- **Metadata Tracking**: Stores upload time, original filename
- **Cleanup on Delete**: Removes all avatar formats when account deleted
- **Public Visibility**: Authenticated users can view others' avatars

---

## 🎭 Visual Design

### Avatar Container
```css
.profile-avatar {
  width: clamp(4.5rem, 12vw, 6.5rem);
  aspect-ratio: 1 / 1;
  border-radius: 1.5rem;
  border: 2px solid rgba(204, 255, 0, 0.25);
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.5);
}
```

**Hover Effects:**
- Scale + rotate transform
- Spinning conic gradient overlay
- Enhanced shadow with accent glow
- Upload button fades in

### Upload Button
```html
<label class="profile-avatar__label">
  <svg class="profile-avatar__icon">...</svg>
  <span class="profile-avatar__text">Upload</span>
</label>
```

**States:**
- **Resting**: Hidden (opacity: 0)
- **Hover**: Fades in with gradient background
- **Hover Button**: Accent color + background highlight
- **Click**: File picker opens

### Progress Indicator
```html
<div id="avatar-progress" class="profile-avatar__progress" hidden>
  <div class="profile-avatar__progress-bar"></div>
</div>
```

**Animation:**
- Full-screen overlay with blur backdrop
- Animated progress bar (scaleX from 0 to 1)
- Shown during upload, hidden on completion

---

## 🔒 Firebase Storage Rules

### File Structure
```
users/
  {userId}/
    profile/
      avatar.jpg   (or .png, .webp)
```

### Security Rules (`storage.rules`)

#### Read Access
```javascript
allow read: if isAuthenticated() 
            && (isOwner(userId) 
                || resource.metadata.visibility == 'public');
```
- User must be logged in
- Can read own avatar OR public avatars

#### Write Access
```javascript
allow write: if isOwner(userId) 
             && isValidImage() 
             && isAvatarFile();
```
- User must own the resource
- File must be valid image (JPEG/PNG/WebP)
- File must be under 5MB
- Filename must be avatar.jpg/png/webp

#### Delete Access
```javascript
allow delete: if isOwner(userId);
```
- User can only delete their own avatars

### Validation Helpers
```javascript
function isValidImage() {
  return request.resource.size < 5 * 1024 * 1024 // 5MB max
      && request.resource.contentType.matches('image/(jpeg|png|webp)');
}

function isAvatarFile() {
  return request.resource.name == 'avatar.jpg' 
      || request.resource.name == 'avatar.png'
      || request.resource.name == 'avatar.webp';
}
```

---

## 💻 Implementation Details

### File Upload Function
```javascript
async function uploadAvatar(uid, file) {
  // Determine extension from MIME type
  let extension = 'jpg';
  if (file.type === 'image/png') extension = 'png';
  else if (file.type === 'image/webp') extension = 'webp';
  
  const path = `users/${uid}/profile/avatar.${extension}`;
  
  // Upload with metadata
  const metadata = {
    contentType: file.type,
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      originalName: file.name,
      visibility: 'public'
    }
  };
  
  await uploadBytes(r, file, metadata);
  const url = await getDownloadURL(r);
  return { url, path };
}
```

### Validation (Client-Side)
```javascript
// File type validation
const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
if (!validTypes.includes(file.type)) {
  throw new Error('Please upload a JPEG, PNG, or WebP image');
}

// File size validation (5MB max)
const maxSize = 5 * 1024 * 1024;
if (file.size > maxSize) {
  throw new Error('Image must be less than 5MB');
}
```

### Save Profile Handler
```javascript
async function handleSaveProfile(user) {
  const file = els.avatarInput?.files?.[0] || null;
  const progressEl = document.getElementById('avatar-progress');
  
  if (file) {
    // Validate
    // Show progress
    if (progressEl) progressEl.hidden = false;
    
    // Upload
    const { url } = await uploadAvatar(user.uid, file);
    
    // Hide progress
    if (progressEl) progressEl.hidden = true;
    
    // Update UI
    if (els.avatarImg) els.avatarImg.src = url;
    if (els.avatarInput) els.avatarInput.value = '';
  }
  
  // Update Firebase Auth profile
  await updateProfile(user, { photoURL });
}
```

### Cleanup on Account Delete
```javascript
async function removeAvatarIfExists(uid) {
  // Try deleting all possible formats
  const extensions = ['jpg', 'png', 'webp'];
  for (const ext of extensions) {
    try {
      const r = sRef(storage, `users/${uid}/profile/avatar.${ext}`);
      await deleteObject(r);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  }
}
```

---

## 🎯 User Flow

### Upload Process
1. **User hovers over avatar** → Upload button fades in
2. **User clicks "Upload"** → File picker opens
3. **User selects image** → File is staged in input
4. **User clicks "Save profile"** → Validation runs
5. **If valid** → Progress indicator shows
6. **File uploads to Storage** → Gets download URL
7. **Progress indicator hides** → Avatar updates instantly
8. **Firebase Auth updates** → photoURL saved
9. **Success toast shows** → "Profile updated"

### Error Handling
- **Invalid file type**: "Please upload a JPEG, PNG, or WebP image"
- **File too large**: "Image must be less than 5MB"
- **Upload failed**: "Failed to upload avatar. Please try again."
- **Network error**: Firebase SDK error message shown

---

## 📐 CSS Animations

### Hover Reveal
```css
.profile-avatar__upload {
  opacity: 0;
  transition: opacity 0.3s ease;
}

.profile-avatar:hover .profile-avatar__upload {
  opacity: 1;
}
```

### Button Hover
```css
.profile-avatar__label:hover {
  color: var(--profile-text-primary);
  background: rgba(204, 255, 0, 0.1);
}
```

### Progress Bar
```css
@keyframes progress-fill {
  0% { transform: scaleX(0); }
  50% { transform: scaleX(0.7); }
  100% { transform: scaleX(1); }
}

.profile-avatar__progress-bar::after {
  animation: progress-fill 1.5s ease-in-out infinite;
}
```

### Image Scale on Hover
```css
.profile-avatar:hover img {
  transform: scale(1.05);
}
```

---

## 🔧 Configuration

### Accepted File Types
```javascript
// HTML input
accept="image/jpeg,image/png,image/webp"

// JS validation
const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
```

### Size Limits
```javascript
// Client-side (JS)
const maxSize = 5 * 1024 * 1024; // 5MB

// Server-side (Storage Rules)
request.resource.size < 5 * 1024 * 1024
```

### File Naming
```javascript
// Storage path
users/{userId}/profile/avatar.{ext}

// Extensions: jpg, png, webp
```

---

## 🚀 Deployment

### Firebase Setup
1. **Deploy Storage Rules**:
   ```bash
   firebase deploy --only storage
   ```

2. **Verify Rules Applied**:
   - Go to Firebase Console → Storage → Rules
   - Check timestamps match deployment

3. **Test Upload**:
   - Login as test user
   - Upload test image
   - Verify file appears in Storage console

### Testing Checklist
- ✅ Hover shows upload button
- ✅ Click opens file picker
- ✅ Valid file uploads successfully
- ✅ Progress indicator shows/hides
- ✅ Avatar updates immediately
- ✅ Invalid file shows error
- ✅ Large file (>5MB) shows error
- ✅ Network error handled gracefully
- ✅ Storage rules enforce security
- ✅ Other users cannot modify avatar

---

## 📊 Performance

### Optimization
- **Lazy Loading**: Avatar only loads when visible
- **Compression**: Consider client-side compression before upload
- **CDN**: Firebase Storage serves via CDN automatically
- **Caching**: Download URLs cached in Firebase Auth

### Metrics
- **Upload Time**: ~1-3s for typical avatar (100KB-1MB)
- **File Size**: Recommended 200KB-500KB after compression
- **Dimensions**: Recommended 512×512 or 1024×1024

---

## 🛠️ Future Enhancements

### Potential Additions
1. **Image Cropper**: Built-in crop tool (aspect ratio 1:1)
2. **Compression**: Automatic client-side compression
3. **Drag & Drop**: Drag image onto avatar to upload
4. **Multiple Sizes**: Generate thumbnails (small/medium/large)
5. **Remove Button**: Separate button to remove avatar
6. **Preview Modal**: Full-screen preview before upload
7. **Image Filters**: Apply filters/effects before save
8. **Upload History**: Track previous avatars

### Libraries to Consider
- **react-easy-crop**: For image cropping
- **browser-image-compression**: For client-side compression
- **cropperjs**: Advanced cropping tool
- **sharp** (server): Generate multiple sizes via Cloud Functions

---

## 🔐 Security Best Practices

1. **Validate on Client AND Server**: Never trust client validation alone
2. **Use Firebase Rules**: Storage rules are your last line of defense
3. **Limit File Types**: Only allow necessary formats
4. **Enforce Size Limits**: Prevent abuse and storage bloat
5. **Authenticate All Access**: Require login for upload/view
6. **Scope Permissions**: Users only access their own files
7. **Monitor Usage**: Set up Firebase alerts for unusual activity
8. **Audit Logs**: Review Storage access logs regularly

---

## 📚 Resources

### Firebase Docs
- [Storage Security Rules](https://firebase.google.com/docs/storage/security)
- [Upload Files](https://firebase.google.com/docs/storage/web/upload-files)
- [File Metadata](https://firebase.google.com/docs/storage/web/file-metadata)

### Related Files
- `/public/pages/profile.html` - Avatar upload UI
- `/public/pages/profile.css` - Upload styling
- `/public/pages/profile.js` - Upload logic
- `/storage.rules` - Storage security rules
- `/firebase.json` - Firebase configuration

---

**Last Updated**: October 14, 2025  
**Version**: 2.0 (Redesigned Upload)  
**Maintainer**: Vibance Security Team
