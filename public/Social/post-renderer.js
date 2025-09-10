/**
 * @file /Social/post-renderer.js
 * @description A module dedicated to building the HTML for social feed posts.
 * It centralizes all post rendering logic for a consistent look and feel.
 */

import { auth } from '../api/firebase.js';
import { createAvatar, createIcon } from './ui-helpers.js';
import { formatRelativeTime } from '../utils.js';

export const PostRenderer = {
    /**
     * Creates the complete HTML for a single post card.
     * @param {object} post - The post object, containing an ID, data, and author details.
     * @returns {string} The HTML string for the post card.
     */
    createPostHTML(post) {
        return `
            <div class="post-card" id="post-${post.id}" data-post-id="${post.id}">
                ${this.renderPostHeader(post)}
                ${this.renderPostBody(post)}
                ${this.renderPostFooter(post)}
            </div>
        `;
    },

    /**
     * Renders the header section of a post, including the author's avatar, name,
     * and the options menu for the post owner.
     * @param {object} post - The post object.
     * @returns {string} HTML for the post header.
     */
    renderPostHeader(post) {
        const isOwner = auth.currentUser && auth.currentUser.uid === post.data.userId;
        const optionsButton = isOwner
            ? `<button class="options-btn" data-action="toggle-options" data-post-id="${post.id}">${createIcon('options')}</button>`
            : '';

        return `
            <div class="post-header">
                <a href="/Social/user-profile.html?id=${post.data.userId}" class="author-details">
                    ${createAvatar(post.author)}
                    <span class="author-name">${post.author.name}</span>
                </a>
                <div class="post-options">
                    ${optionsButton}
                    <div class="options-menu hidden" data-menu-for-post="${post.id}">
                        <button data-action="edit-post" data-post-id="${post.id}">Edit</button>
                        <button data-action="delete-post" data-post-id="${post.id}" data-image-url="${post.data.imageUrl}" class="delete">Delete</button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Renders the main body of a post, which is the image.
     * @param {object} post - The post object.
     * @returns {string} HTML for the post body.
     */
    renderPostBody(post) {
        if (!post.data.imageUrl) return '';
        return `
            <div class="post-body">
                <img src="${post.data.imageUrl}" alt="Post image by ${post.author.name}" class="post-image" data-action="view-image">
            </div>
        `;
    },

    /**
     * Renders the footer of a post, including action buttons, like count, description, and timestamp.
     * @param {object} post - The post object.
     * @returns {string} HTML for the post footer.
     */
    renderPostFooter(post) {
        return `
            <div class="post-footer">
                ${this.renderPostActions(post)}
                ${this.renderPostLikes(post)}
                ${this.renderPostDescription(post)}
                <div class="post-timestamp">
                    ${formatRelativeTime(post.data.createdAt)}
                </div>
            </div>
        `;
    },

    /**
     * Renders the main action buttons (like, comment).
     * @param {object} post - The post object.
     * @returns {string} HTML for the action buttons.
     */
    renderPostActions(post) {
        const isLiked = auth.currentUser && post.data.likes.includes(auth.currentUser.uid);
        return `
            <div class="post-actions">
                <button class="action-btn" data-action="like-post" data-post-id="${post.id}">
                    ${createIcon(isLiked ? 'liked' : 'like')}
                </button>
                <button class="action-btn" data-action="comment-post" data-post-id="${post.id}">
                    ${createIcon('comment')}
                </button>
            </div>
        `;
    },

    /**
     * Renders the like count display.
     * @param {object} post - The post object.
     * @returns {string} HTML for the like count.
     */
    renderPostLikes(post) {
        const likeCount = post.data.likes.length;
        if (likeCount === 0) return '';
        return `<div class="post-likes">${likeCount} like${likeCount === 1 ? '' : 's'}</div>`;
    },

    /**
     * Renders the post description (caption), now including the hidden edit form.
     * @param {object} post - The post object.
     * @returns {string} HTML for the description and edit form.
     */
    renderPostDescription(post) {
        if (!post.data.description) return '';
        return `
            <div class="post-description-wrapper">
                <div class="post-description view-mode">
                    <a href="/Social/user-profile.html?id=${post.data.userId}" class="author-name-link">${post.author.name}</a>
                    <span>${post.data.description}</span>
                </div>
                <div class="post-description-edit edit-mode hidden">
                    <textarea class="edit-textarea">${post.data.description}</textarea>
                    <div class="edit-actions">
                        <button class="edit-cancel-btn" data-action="cancel-edit" data-post-id="${post.id}">Cancel</button>
                        <button class="edit-save-btn" data-action="save-edit" data-post-id="${post.id}">Save</button>
                    </div>
                </div>
            </div>
        `;
    }
};

