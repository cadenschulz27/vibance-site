/**
 * @file /Social/data-service.js
 * @description A dedicated module for all Firestore interactions related to the social feed.
 * This service centralizes data fetching, creation, and updates for posts and comments.
 */

import {
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    doc,
    getDoc,
    addDoc,
    serverTimestamp,
    updateDoc,
    deleteDoc,
    startAfter,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { auth, db, storage } from '../api/firebase.js';

const POSTS_PER_PAGE = 10;

export const DataService = {

    /**
     * Fetches a paginated list of posts from Firestore.
     * @param {DocumentSnapshot} lastVisible - The last document snapshot from the previous page, for pagination.
     * @returns {Promise<Array<object>>} A promise that resolves to an array of post objects.
     */
    async fetchPosts(lastVisible = null) {
        try {
            const postsCollection = collection(db, "posts");
            let q;
            if (lastVisible) {
                q = query(postsCollection, orderBy("createdAt", "desc"), startAfter(lastVisible), limit(POSTS_PER_PAGE));
            } else {
                q = query(postsCollection, orderBy("createdAt", "desc"), limit(POSTS_PER_PAGE));
            }
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        } catch (error) {
            console.error("Error fetching posts:", error);
            return [];
        }
    },

    /**
     * Fetches a single post by its ID.
     * @param {string} postId - The ID of the post to fetch.
     * @returns {Promise<object|null>} The post object or null if not found.
     */
    async fetchPostById(postId) {
        try {
            const postRef = doc(db, 'posts', postId);
            const docSnap = await getDoc(postRef);
            if (docSnap.exists()) {
                const postData = { id: docSnap.id, data: docSnap.data() };
                postData.author = await this.fetchUserProfile(postData.data.userId);
                return postData;
            }
            return null;
        } catch (error) {
            console.error("Error fetching post by ID:", error);
            return null;
        }
    },

    /**
     * Fetches a user's profile from the 'users' collection.
     * @param {string} userId - The ID of the user to fetch.
     * @returns {Promise<object>} The user's profile data.
     */
    async fetchUserProfile(userId) {
        if (!userId) return { name: 'Anonymous', photoURL: null };
        try {
            const userRef = doc(db, 'users', userId);
            const docSnap = await getDoc(userRef);
            return docSnap.exists() ? docSnap.data() : { name: 'Anonymous', photoURL: null };
        } catch (error) {
            console.error("Error fetching user profile:", error);
            return { name: 'Anonymous', photoURL: null };
        }
    },

    /**
     * Creates a new post with an optional image.
     * @param {string} description - The text content of the post.
     * @param {File} imageFile - The image file to upload (optional).
     */
    async createPost(description, imageFile) {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated.");

        let imageUrl = '';
        if (imageFile) {
            const filePath = `posts/${user.uid}/${Date.now()}_${imageFile.name}`;
            const storageRef = ref(storage, filePath);
            const snapshot = await uploadBytes(storageRef, imageFile);
            imageUrl = await getDownloadURL(snapshot.ref);
        }

        const postsCollection = collection(db, 'posts');
        await addDoc(postsCollection, {
            userId: user.uid,
            description: description,
            imageUrl: imageUrl,
            createdAt: serverTimestamp(),
            likes: [],
            commentCount: 0
        });
    },
    
    /**
     * Updates the description of an existing post.
     * @param {string} postId - The ID of the post to update.
     * @param {string} newDescription - The new text content for the post.
     */
    async updatePost(postId, newDescription) {
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, { description: newDescription });
    },

    /**
     * Deletes a post and its associated image from storage.
     * @param {string} postId - The ID of the post to delete.
     * @param {string} imageUrl - The URL of the image to delete from storage.
     */
    async deletePost(postId, imageUrl) {
        if (imageUrl) {
            const imageRef = ref(storage, imageUrl);
            await deleteObject(imageRef).catch(err => console.error("Error deleting image:", err));
        }
        const postRef = doc(db, 'posts', postId);
        await deleteDoc(postRef);
    },

    /**
     * Adds a comment to a specific post.
     * @param {string} postId - The ID of the post to comment on.
     * @param {string} text - The text of the comment.
     */
    async addComment(postId, text) {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated.");

        const commentsCollection = collection(db, 'posts', postId, 'comments');
        await addDoc(commentsCollection, {
            userId: user.uid,
            text: text,
            createdAt: serverTimestamp()
        });
        const postRef = doc(db, 'posts', postId);
        await updateDoc(postRef, { commentCount: increment(1) });
    },
    
    /**
     * Creates a real-time listener for a post's comments.
     * @param {string} postId - The ID of the post.
     * @param {Function} callback - The function to call with the comments array.
     * @returns {Function} The unsubscribe function for the listener.
     */
    onCommentsSnapshot(postId, callback) {
        const commentsQuery = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
        
        return onSnapshot(commentsQuery, async (snapshot) => {
            const comments = await Promise.all(snapshot.docs.map(async (doc) => {
                const commentData = doc.data();
                const author = await this.fetchUserProfile(commentData.userId);
                return { id: doc.id, data: commentData, author };
            }));
            callback(comments);
        });
    }
};

