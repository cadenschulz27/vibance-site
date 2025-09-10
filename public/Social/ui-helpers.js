/**
 * @file /Social/ui-helpers.js
 * @description A library of functions that generate reusable UI components like icons and avatars.
 */

/**
 * Creates an SVG icon based on the specified name. This is an advanced technique
 * to keep all icons in one place and avoid repeating SVG code.
 * @param {string} name - The name of the icon (e.g., 'heart', 'comment', 'dots').
 * @param {boolean} isFilled - (Optional) For icons like 'heart', determines if it should be the filled version.
 * @returns {string} The HTML string for the SVG icon.
 */
export function createIcon(name, isFilled = false) {
    const icons = {
        heart: isFilled
            ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" /></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>`,
        comment: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>`,
        dots: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" /></svg>`
    };
    return icons[name] || '';
}

/**
 * Creates the HTML for a user avatar, using their profile picture or a placeholder.
 * @param {object} author - The author object, containing 'name' and 'photoURL'.
 * @param {string} sizeClass - (Optional) A Tailwind CSS class for the avatar size.
 * @returns {string} The HTML string for the avatar.
 */
export function createAvatar(author, sizeClass = 'h-8 w-8') {
    if (!author) return '';
    const avatarSrc = author.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(author.name)}&background=2d2d2d&color=fff&size=64`;
    return `
        <div class="create-post-avatar ${sizeClass}">
            <img src="${avatarSrc}" alt="${author.name}'s avatar">
        </div>
    `;
}

