/**
 * @file /Social/interaction-manager.js
 * @description Manages user interactions with posts, such as liking, commenting, and deleting.
 */

import { auth, db, storage } from '../api/firebase.js';
import { doc, getDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, collection, addDoc, serverTimestamp, increment, query, orderBy, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";


/**
 * Formats a Firestore Timestamp into a more user-friendly, relative time string.
 * @param {object} timestamp - The Firestore Timestamp object.
 * @returns {string} A formatted time string (e.g., "5h ago", "2d ago").
 */
function formatRelativeTime(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== 'function') return 'Just now';
    
    const now = new Date();
    const past = timestamp.toDate();
    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;

    return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}


export const InteractionManager = {

    async handleLike(postId) {
        const user = auth.currentUser;
        if (!user) {
            alert('You must be logged in to like posts.');
            return null;
        }
        const postRef = doc(db, 'posts', postId);
        try {
            const postSnap = await getDoc(postRef);
            if (!postSnap.exists()) {
                console.error("Post not found.");
                return null;
            }
            const postData = postSnap.data();
            const likes = postData.likes || [];
            let userHasLiked = likes.includes(user.uid);

            if (userHasLiked) {
                await updateDoc(postRef, { likes: arrayRemove(user.uid) });
            } else {
                await updateDoc(postRef, { likes: arrayUnion(user.uid) });
            }
            return true;

        } catch (error) {
            console.error("Error handling like:", error);
            alert("There was an error processing your like. Please try again.");
            return null;
        }
    },

    async handleComment(postId, commentText) {
        const user = auth.currentUser;
        if (!user) {
            alert('You must be logged in to comment.');
            return false;
        }
        if (!commentText.trim()) return false;
        
        const postRef = doc(db, 'posts', postId);
        const commentsCollectionRef = collection(db, 'posts', postId, 'comments');

        try {
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            const userName = userDoc.exists() ? userDoc.data().name : "Anonymous";

            await addDoc(commentsCollectionRef, {
                userId: user.uid,
                userName: userName,
                text: commentText,
                createdAt: serverTimestamp()
            });

            await updateDoc(postRef, { commentCount: increment(1) });
            return true;
        } catch (error) {
            console.error("Error creating comment:", error);
            alert("There was an error posting your comment. Please try again.");
            return false;
        }
    },

    /**
     * FIX: Replaced one-time fetch with a real-time listener for comments.
     * @param {string} postId - The ID of the post for which to load comments.
     * @param {Function} callback - A function to call with the updated comments HTML.
     * @returns {Function} An unsubscribe function to stop the listener.
     */
    createCommentListener(postId, callback) {
        const commentsCollectionRef = collection(db, 'posts', postId, 'comments');
        const q = query(commentsCollectionRef, orderBy('createdAt', 'asc'));

        return onSnapshot(q, (querySnapshot) => {
            let commentsHTML = '';
            if (querySnapshot.empty) {
                commentsHTML = '<p class="text-gray-500 text-sm">No comments yet.</p>';
            } else {
                querySnapshot.forEach(doc => {
                    const comment = doc.data();
                    commentsHTML += `
                        <div class="comment">
                            <p>
                                <span class="comment-author">${comment.userName}</span>
                                <span class="comment-text">${comment.text}</span>
                            </p>
                            <span class="comment-timestamp text-xs text-gray-500">${formatRelativeTime(comment.createdAt)}</span>
                        </div>
                    `;
                });
            }
            callback(commentsHTML);
        }, (error) => {
            console.error("Error listening to comments:", error);
            callback('<p class="text-red-500 text-sm">Could not load comments.</p>');
        });
    },

    async handleDeletePost(postId) {
        const user = auth.currentUser;
        if (!user) {
            alert('You must be logged in to delete posts.');
            return false;
        }
        const postRef = doc(db, 'posts', postId);
        try {
            const postSnap = await getDoc(postRef);
            if (!postSnap.exists()) return false;
            
            const postData = postSnap.data();
            if (postData.userId !== user.uid) {
                alert('You can only delete your own posts.');
                return false;
            }

            if (postData.imageUrl) {
                const imageRef = ref(storage, postData.imageUrl);
                await deleteObject(imageRef).catch(err => console.error("Image delete failed:", err));
            }
            
            const commentsCollectionRef = collection(db, 'posts', postId, 'comments');
            const commentsSnap = await getDocs(commentsCollectionRef);
            for (const commentDoc of commentsSnap.docs) {
                await deleteDoc(doc(db, 'posts', postId, 'comments', commentDoc.id));
            }

            await deleteDoc(postRef);
            return true;
        } catch (error) {
            console.error("Error deleting post:", error);
            alert("There was an error deleting your post. Please try again.");
            return false;
        }
    },

    async handleEditPost(postId, newDescription) {
        const user = auth.currentUser;
        if (!user) {
            alert('You must be logged in to edit posts.');
            return false;
        }
        const postRef = doc(db, 'posts', postId);
        try {
            const postSnap = await getDoc(postRef);
            if (!postSnap.exists() || postSnap.data().userId !== user.uid) {
                return false;
            }
            await updateDoc(postRef, { description: newDescription });
            return true;
        } catch (error)_mod
            console.error("Error editing post:", error);
            alert("There was an error saving your changes. Please try again.");
            return false;
        }
    },

    createPostListener(postId, callback) {
        const postRef = doc(db, 'posts', postId);
        return onSnapshot(postRef, (doc) => {
            if (doc.exists()) {
                callback(doc.data());
            }
        });
    }
};

