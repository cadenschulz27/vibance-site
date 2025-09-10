/**
 * @file /Social/modal-manager.js
 * @description Manages all modals for the social feed, including the comments view.
 */
import { createAvatar, createIcon } from './ui-helpers.js';
import { DataService } from './data-service.js';
import { auth } from '../api/firebase.js';

let activeModal = null;

function createModal(content, type = 'default') {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = `modal-content ${type}-modal-content`;
    contentWrapper.innerHTML = content;

    backdrop.appendChild(contentWrapper);
    document.body.appendChild(backdrop);
    
    activeModal = backdrop;

    const close = () => {
        backdrop.remove();
        activeModal = null;
    };

    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            close();
        }
    });

    contentWrapper.querySelector('.close-modal-btn')?.addEventListener('click', close);
    
    return { modalElement: contentWrapper, close };
}

async function showCommentsModal(post) {
    const modalContent = `
        <div class="comments-modal-image">
            <img src="${post.imageUrl}" alt="Post image">
        </div>
        <div class="comments-modal-details">
            <div class="modal-header">
                <a href="/Social/user-profile.html?id=${post.userId}" class="author-info">
                    ${createAvatar(post.author)}
                    <span class="author-name">${post.author.name}</span>
                </a>
                <button class="close-modal-btn">&times;</button>
            </div>
            <div class="comments-list">
                <div class="comment">
                     ${createAvatar(post.author)}
                    <div>
                        <p class="comment-text">
                            <a href="/Social/user-profile.html?id=${post.userId}" class="author-name">${post.author.name}</a>
                            <span>${post.description}</span>
                        </p>
                    </div>
                </div>
                <!-- More comments will be loaded here -->
            </div>
            <div class="comment-form-container">
                 <div class="post-actions" style="padding: 0 16px 8px;">
                     <button class="action-btn like-btn ${post.likes.includes(auth.currentUser.uid) ? 'liked' : ''}" data-post-id="${post.id}">
                        ${createIcon('like')}
                    </button>
                    <button class="action-btn comment-btn" data-post-id="${post.id}">
                        ${createIcon('comment')}
                    </button>
                 </div>
                 <p class="post-likes" style="padding: 0 16px 8px;">${post.likes.length} likes</p>
                <form class="comment-form" data-post-id="${post.id}">
                    <input type="text" class="comment-input" placeholder="Add a comment..." required>
                    <button type="submit" class="btn-post" style="padding: 8px; border-radius: 8px;">Post</button>
                </form>
            </div>
        </div>
    `;
    const { modalElement, close } = createModal(modalContent, 'comments');
    const commentsListEl = modalElement.querySelector('.comments-list');
    
    const comments = await DataService.fetchComments(post.id);
    comments.forEach(comment => {
        const commentEl = document.createElement('div');
        commentEl.className = 'comment';
        commentEl.innerHTML = `
            ${createAvatar(comment.author)}
            <div>
                 <p class="comment-text">
                    <a href="/Social/user-profile.html?id=${comment.userId}" class="author-name">${comment.author.name}</a>
                    <span>${comment.text}</span>
                 </p>
            </div>
        `;
        commentsListEl.appendChild(commentEl);
    });

    modalElement.querySelector('.comment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = e.target.querySelector('.comment-input');
        await DataService.postComment(post.id, input.value);
        close();
        // A full refresh is needed to see the new comment count on the main feed
        window.dispatchEvent(new CustomEvent('feed-needs-refresh'));
    });
}

async function showOptionsMenu(post) {
     const isOwner = auth.currentUser.uid === post.userId;
     let options = isOwner 
        ? '<button class="option-btn delete-btn" data-post-id="'+post.id+'">Delete</button>'
        : '<button class="option-btn">Report</button>';

     const modalContent = `
        <div class="options-modal">
            ${options}
            <button class="option-btn close-modal-btn">Cancel</button>
        </div>
     `;
     const { modalElement, close } = createModal(modalContent, 'options');

     modalElement.querySelector('.delete-btn')?.addEventListener('click', async () => {
         if (confirm('Are you sure you want to delete this post?')) {
            await DataService.deletePost(post.id, post.imageUrl);
            close();
            window.dispatchEvent(new CustomEvent('feed-needs-refresh'));
         }
     });
}

export const ModalManager = {
    showComments(post) {
        showCommentsModal(post);
    },
    showOptions(post) {
        showOptionsMenu(post);
    },
    closeActive() {
        if(activeModal) {
            activeModal.remove();
            activeModal = null;
        }
    }
};
