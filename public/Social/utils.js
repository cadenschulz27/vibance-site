/**
 * @file /public/utils.js
 * @description A collection of shared helper functions used across the application.
 */

/**
 * Formats a Firestore Timestamp into a user-friendly, relative time string.
 * Examples: "Just now", "5m ago", "2h ago", "3d ago", or "Sep 10".
 * @param {object} timestamp - The Firestore Timestamp object.
 * @returns {string} A formatted relative time string.
 */
export function formatRelativeTime(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== 'function') {
        // Return a default for invalid input
        return 'a moment ago';
    }

    const now = new Date();
    const past = timestamp.toDate();
    const diffInSeconds = Math.floor((now - past) / 1000);

    // Time difference constants
    const minute = 60;
    const hour = minute * 60;
    const day = hour * 24;
    const week = day * 7;

    if (diffInSeconds < minute) {
        return 'Just now';
    } else if (diffInSeconds < hour) {
        const minutes = Math.floor(diffInSeconds / minute);
        return `${minutes}m ago`;
    } else if (diffInSeconds < day) {
        const hours = Math.floor(diffInSeconds / hour);
        return `${hours}h ago`;
    } else if (diffInSeconds < week) {
        const days = Math.floor(diffInSeconds / day);
        return `${days}d ago`;
    } else {
        // For older posts, show the date like "Sep 10"
        return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}
