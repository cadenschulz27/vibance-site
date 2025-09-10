/**
 * @file /Social/data-service.js
 * @description Centralized service for all Firestore interactions related to the social feed.
 */
import { auth, db, storage } from '../api/firebase.js';
import {
    collection, query, where, orderBy, getDocs, doc, getDoc,
    addDoc, updateDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

async function fetchAuthorDetails(userId) {
    if (!userId) return { name: 'Anonymous', photoURL: '' };
    const userDocRef = doc(db, 'users', userId);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
        const { name, photoURL } = userDocSnap.data();
        return { name, photoURL };
    }
    return { name: 'Anonymous', photoURL: '' };
}

export const DataService = {
    async fetchFeedPosts() {
        const postsCollection = collection(db, "posts");
        const q = query(postsCollection, orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        const posts = await Promise.all(querySnapshot.docs.map(async (doc) => {
            const postData = doc.data();
            const author = await fetchAuthorDetails(postData.userId);
            return {
                id: doc.id,
                ...postData,
                author,
            };
        }));
        return posts;
    },

    async fetchUserProfile(userId) {
        return await fetchAuthorDetails(userId);
    },

    async fetchPostsByUser(userId) {
        const postsCollection = collection(db, "posts");
        const q = query(postsCollection, where("userId", "==", userId), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async toggleLike(postId, likes) {
        const userId = auth.currentUser.uid;
        const postRef = doc(db, 'posts', postId);
        if (likes.includes(userId)) {
            await updateDoc(postRef, { likes: arrayRemove(userId) });
        } else {
            await updateDoc(postRef, { likes: arrayUnion(userId) });
        }
    },

    async fetchComments(postId) {
        const commentsCollection = collection(db, 'posts', postId, 'comments');
        const q = query(commentsCollection, orderBy('createdAt', 'asc'));
        const querySnapshot = await getDocs(q);
        
        return await Promise.all(querySnapshot.docs.map(async (doc) => {
             const commentData = doc.data();
             const author = await fetchAuthorDetails(commentData.userId);
             return { id: doc.id, ...commentData, author };
        }));
    },
    
    async postComment(postId, text) {
        const user = auth.currentUser;
        const postRef = doc(db, 'posts', postId);
        const commentsCollection = collection(db, 'posts', postId, 'comments');
        
        await addDoc(commentsCollection, {
            userId: user.uid,
            text: text,
            createdAt: serverTimestamp()
        });
        await updateDoc(postRef, { commentCount: increment(1) });
    },

    async deletePost(postId, imageUrl) {
        if (imageUrl) {
            const imageRef = ref(storage, imageUrl);
            await deleteObject(imageRef).catch(err => console.error("Image delete failed:", err));
        }
        await deleteDoc(doc(db, 'posts', postId));
    }
};
