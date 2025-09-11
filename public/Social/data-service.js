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
    onSnapshot,
    where,
    increment,
    arrayUnion,
    arrayRemove,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { auth, db, storage } from '../api/firebase.js';

const POSTS_PER_PAGE = 10;

export const DataService = {

    /**
     * Fetches a paginated list of all posts from Firestore.
     * @param {DocumentSnapshot} lastVisible - The last document snapshot from the previous page.
     * @returns {Promise<object>} An object containing the posts and the last visible document.
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
            const posts = querySnapshot.docs.map(doc => ({ id: doc.id, data: doc.data(), doc: doc }));
            return {
                posts: posts,
                lastVisible: querySnapshot.docs[querySnapshot.docs.length - 1]
            };
        } catch (error) {
            console.error("Error fetching posts:", error);
            return { posts: [], lastVisible: null };
        }
    },
    
    /**
     * Fetches all posts created by a specific user.
     * @param {string} userId - The ID of the user whose posts to fetch.
     * @returns {Promise<Array<object>>} A promise that resolves to an array of post objects.
     */
    async fetchPostsByUserId(userId) {
        try {
            const postsCollection = collection(db, "posts");
            const q = query(postsCollection, where("userId", "==", userId), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        } catch (error) {
            console.error("Error fetching posts by user ID:", error);
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
        if (!userId) return { name: 'Anonymous', photoURL: null, followers: [], following: [] };
        try {
            const userRef = doc(db, 'users', userId);
            const docSnap = await getDoc(userRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                return {
                    name: data.name || 'Anonymous',
                    photoURL: data.photoURL || null,
                    followers: data.followers || [],
                    following: data.following || []
                };
            }
            return { name: 'Anonymous', photoURL: null, followers: [], following: [] };
        } catch (error) {
            console.error("Error fetching user profile:", error);
            return { name: 'Anonymous', photoURL: null, followers: [], following: [] };
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
     * Toggles a user's like on a post.
     * @param {string} postId - The ID of the post to like/unlike.
     */
    async toggleLike(postId) {
        const user = auth.currentUser;
        if (!user) throw new Error("User not authenticated.");

        const postRef = doc(db, 'posts', postId);
        const postSnap = await getDoc(postRef);
        if (postSnap.exists()) {
            const postData = postSnap.data();
            const likes = postData.likes || [];
            if (likes.includes(user.uid)) {
                await updateDoc(postRef, { likes: arrayRemove(user.uid) });
            } else {
                await updateDoc(postRef, { likes: arrayUnion(user.uid) });
            }
        }
    },

    /**
     * Adds or removes a follow relationship between the current user and another user.
     * @param {string} profileUserId - The ID of the user to follow or unfollow.
     */
    async toggleFollow(profileUserId) {
        const currentUserId = auth.currentUser.uid;
        if (currentUserId === profileUserId) return; // Cannot follow oneself

        const currentUserRef = doc(db, 'users', currentUserId);
        const profileUserRef = doc(db, 'users', profileUserId);

        const batch = writeBatch(db);
        const profileDoc = await getDoc(profileUserRef);
        const followers = profileDoc.data()?.followers || [];

        if (followers.includes(currentUserId)) {
            // Unfollow
            batch.update(currentUserRef, { following: arrayRemove(profileUserId) });
            batch.update(profileUserRef, { followers: arrayRemove(currentUserId) });
        } else {
            // Follow
            batch.update(currentUserRef, { following: arrayUnion(profileUserId) });
            batch.update(profileUserRef, { followers: arrayUnion(currentUserId) });
        }
        await batch.commit();
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

