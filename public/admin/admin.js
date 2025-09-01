import { auth, db, storage } from '../api/firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp, where, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

// --- AUTHENTICATION GUARD ---
onAuthStateChanged(auth, user => {
    if (user && user.email === 'cadenschulz@gmail.com') {
        initializeApp();
    } else {
        console.log("Redirecting: User is not the admin or is not logged in.");
        window.location.href = '../index.html';
    }
});

// --- QUILL EDITOR OPTIONS ---
const quillOptions = {
    theme: 'snow',
    modules: {
        toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'link'],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            ['clean']
        ]
    }
};

// --- INITIALIZATION ---
function initializeApp() {
    // *** FIX: Added redirect on logout ***
    document.getElementById('logout-btn').addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.href = '../login.html';
        });
    });
    initAboutUs();
    initBlog();
    initCareers();
    initPress();
}

// --- REUSABLE UPLOADER FUNCTION ---
// This function is well-written and requires no changes.
function createUploader(options) {
    const { dropZone, fileInput, progressContainer, progressBar, filePreview, hiddenUrlInput, storagePath } = options;

    const handleFile = (file) => {
        if (!file || !file.type.startsWith('image/')) {
            alert('Please select a valid image file.');
            return;
        }
        
        const storageRef = ref(storage, `${storagePath}/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';

        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                progressBar.style.width = progress + '%';
            }, 
            (error) => { 
                console.error("Upload failed:", error); 
                alert("Upload failed. Check console and storage rules.");
            }, 
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                    hiddenUrlInput.value = downloadURL;
                    filePreview.innerHTML = `<img src="${downloadURL}" class="h-20 mt-2 rounded-lg object-cover">`;
                });
            }
        );
    };

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); });
}

// --- ABOUT US MANAGEMENT ---
// This section uses a standard textarea and works correctly. No changes needed.
async function initAboutUs() {
    const aboutForm = document.getElementById('about-us-form');
    const storyTextarea = document.getElementById('about-us-story');
    const contentRef = doc(db, 'siteContent', 'aboutUs');

    const docSnap = await getDoc(contentRef);
    if (docSnap.exists()) {
        storyTextarea.value = docSnap.data().story;
    }

    aboutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await setDoc(contentRef, { story: storyTextarea.value });
        alert('About Us page updated!');
    });
}

// --- BLOG MANAGEMENT ---
async function initBlog() {
    // *** FIX: Initialize Quill Editor ***
    const blogEditor = new Quill('#blog-editor', quillOptions);

    const blogForm = document.getElementById('blog-form');
    const blogTitle = document.getElementById('blog-title');
    const blogAuthor = document.getElementById('blog-author');
    const blogPostId = document.getElementById('blog-post-id');
    const postsList = document.getElementById('blog-posts-list');
    const clearBlogBtn = document.getElementById('clear-blog-form');
    const coverPhotoUrlInput = document.getElementById('blog-cover-photo-url');
    const postsCollection = collection(db, 'siteContent', 'blog', 'posts');

    createUploader({
        dropZone: document.getElementById('blog-drop-zone'),
        fileInput: document.getElementById('blog-file-input'),
        progressContainer: document.getElementById('blog-upload-progress-container'),
        progressBar: document.getElementById('blog-upload-progress-bar'),
        filePreview: document.getElementById('blog-file-preview'),
        hiddenUrlInput: coverPhotoUrlInput,
        storagePath: 'images/blog-covers'
    });

    const resetBlogForm = () => {
        blogForm.reset();
        blogPostId.value = '';
        coverPhotoUrlInput.value = '';
        // *** FIX: Clear Quill editor ***
        blogEditor.root.innerHTML = '';
        document.getElementById('blog-file-preview').innerHTML = '';
        document.getElementById('blog-upload-progress-container').classList.add('hidden');
        document.getElementById('blog-form-title').textContent = 'Add New Post';
    };

    async function setFeaturedPost(postId) {
        // This function works correctly. No changes needed.
        const batch = writeBatch(db);
        const q = query(postsCollection, where("isFeatured", "==", true));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
            batch.update(doc.ref, { isFeatured: false });
        });
        const newFeaturedRef = doc(postsCollection, postId);
        batch.update(newFeaturedRef, { isFeatured: true });
        await batch.commit();
        alert('Featured post updated!');
        loadPosts();
    }

    async function loadPosts() {
        postsList.innerHTML = '';
        const q = query(postsCollection, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach(doc => {
            const post = doc.data();
            const postEl = document.createElement('div');
            postEl.className = 'flex justify-between items-center p-2 border-b border-gray-700';
            postEl.innerHTML = `<span>${post.isFeatured ? '⭐' : ''} ${post.title} <em class="text-gray-400 text-sm">- by ${post.author || 'Unknown'}</em></span>`;
            
            const btnContainer = document.createElement('div');
            // ... (button creation logic is fine)
            const featureBtn = document.createElement('button');
            featureBtn.textContent = 'Feature';
            featureBtn.className = 'text-blue-400 text-sm';
            if (post.isFeatured) {
                featureBtn.disabled = true;
                featureBtn.className += ' opacity-50 cursor-not-allowed';
            }
            featureBtn.onclick = () => setFeaturedPost(doc.id);

            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'text-neon text-sm ml-2';
            editBtn.onclick = () => {
                document.getElementById('blog-form-title').textContent = 'Editing Post';
                blogPostId.value = doc.id;
                blogTitle.value = post.title;
                blogAuthor.value = post.author || '';
                coverPhotoUrlInput.value = post.coverPhotoURL || '';
                document.getElementById('blog-file-preview').innerHTML = post.coverPhotoURL ? `<img src="${post.coverPhotoURL}" class="h-16 mt-2 rounded">` : '';
                // *** FIX: Set Quill editor content ***
                blogEditor.root.innerHTML = post.content;
                window.scrollTo(0, blogForm.offsetTop);
            };

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'text-red-500 text-sm ml-2';
            deleteBtn.onclick = async () => {
                if (confirm('Are you sure?')) {
                    await deleteDoc(doc.ref);
                    loadPosts();
                }
            };
            
            btnContainer.appendChild(featureBtn);
            btnContainer.appendChild(editBtn);
            btnContainer.appendChild(deleteBtn);
            postEl.appendChild(btnContainer);
            postsList.appendChild(postEl);
        });
    }

    blogForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = blogPostId.value;
        const data = {
            title: blogTitle.value,
            author: blogAuthor.value,
            coverPhotoURL: coverPhotoUrlInput.value,
            // *** FIX: Get content from Quill editor ***
            content: blogEditor.root.innerHTML,
            createdAt: serverTimestamp()
        };

        if (id) {
            delete data.createdAt; 
            await updateDoc(doc(postsCollection, id), data);
        } else {
            data.isFeatured = false;
            await addDoc(postsCollection, data);
        }
        
        resetBlogForm();
        alert('Blog post saved!');
        loadPosts();
    });

    clearBlogBtn.addEventListener('click', resetBlogForm);
    loadPosts();
}

// --- CAREERS MANAGEMENT ---
async function initCareers() {
    // *** FIX: Initialize Quill Editor ***
    const careerEditor = new Quill('#career-editor', quillOptions);

    const careerForm = document.getElementById('career-form');
    const careerTitle = document.getElementById('career-title');
    const careerLocation = document.getElementById('career-location');
    const careerType = document.getElementById('career-type');
    const careerPostId = document.getElementById('career-post-id');
    const careersList = document.getElementById('careers-list');
    const clearCareerBtn = document.getElementById('clear-career-form');
    const careersCollection = collection(db, 'siteContent', 'careers', 'jobs');

    const resetCareerForm = () => {
        careerForm.reset();
        careerPostId.value = '';
        // *** FIX: Clear Quill editor ***
        careerEditor.root.innerHTML = '';
        document.getElementById('career-form-title').textContent = 'Add New Job';
    };

    async function loadCareers() {
        careersList.innerHTML = '';
        const q = query(careersCollection, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach(doc => {
            const job = doc.data();
            const jobEl = document.createElement('div');
            jobEl.className = 'flex justify-between items-center p-2 border-b border-gray-700';
            jobEl.innerHTML = `<div><p class="font-bold">${job.title}</p><p class="text-sm text-gray-400">${job.type} &bull; ${job.location}</p></div>`;
            
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'text-neon text-sm';
            editBtn.onclick = () => {
                document.getElementById('career-form-title').textContent = 'Editing Job';
                careerPostId.value = doc.id;
                careerTitle.value = job.title;
                careerLocation.value = job.location;
                careerType.value = job.type;
                // *** FIX: Set Quill editor content ***
                careerEditor.root.innerHTML = job.description;
                window.scrollTo(0, careerForm.offsetTop);
            };

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'text-red-500 text-sm ml-2';
            deleteBtn.onclick = async () => {
                if (confirm('Are you sure?')) {
                    await deleteDoc(doc.ref);
                    loadCareers();
                }
            };
            
            const btnContainer = document.createElement('div');
            btnContainer.appendChild(editBtn);
            btnContainer.appendChild(deleteBtn);
            jobEl.appendChild(btnContainer);
            careersList.appendChild(jobEl);
        });
    }

    careerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = careerPostId.value;
        const data = {
            title: careerTitle.value,
            location: careerLocation.value,
            type: careerType.value,
            // *** FIX: Get content from Quill editor ***
            description: careerEditor.root.innerHTML,
            createdAt: serverTimestamp()
        };

        if (id) {
            delete data.createdAt;
            await updateDoc(doc(careersCollection, id), data);
        } else {
            await addDoc(careersCollection, data);
        }
        
        resetCareerForm();
        alert('Job listing saved!');
        loadCareers();
    });

    clearCareerBtn.addEventListener('click', resetCareerForm);
    loadCareers();
}

// --- PRESS MANAGEMENT ---
async function initPress() {
    // *** FIX: Initialize Quill Editor ***
    const pressEditor = new Quill('#press-editor', quillOptions);

    const pressForm = document.getElementById('press-form');
    const pressTitle = document.getElementById('press-title');
    const pressDate = document.getElementById('press-date');
    const pressPostId = document.getElementById('press-post-id');
    const pressList = document.getElementById('press-list');
    const clearPressBtn = document.getElementById('clear-press-form');
    const pressSource = document.getElementById('press-source');
    const coverPhotoUrlInput = document.getElementById('press-cover-photo-url');
    const pressCollection = collection(db, 'siteContent', 'press', 'releases');

    createUploader({
        dropZone: document.getElementById('press-drop-zone'),
        fileInput: document.getElementById('press-file-input'),
        progressContainer: document.getElementById('press-upload-progress-container'),
        progressBar: document.getElementById('press-upload-progress-bar'),
        filePreview: document.getElementById('press-file-preview'),
        hiddenUrlInput: coverPhotoUrlInput,
        storagePath: 'images/press-covers'
    });

    const resetPressForm = () => {
        pressForm.reset();
        pressPostId.value = '';
        coverPhotoUrlInput.value = '';
        // *** FIX: Clear Quill editor ***
        pressEditor.root.innerHTML = '';
        document.getElementById('press-file-preview').innerHTML = '';
        document.getElementById('press-upload-progress-container').classList.add('hidden');
        document.getElementById('press-form-title').textContent = 'Add New Release';
    };

    async function loadPressReleases() {
        pressList.innerHTML = '';
        const q = query(pressCollection, orderBy('date', 'desc'));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach(doc => {
            const release = doc.data();
            const releaseEl = document.createElement('div');
            releaseEl.className = 'flex justify-between items-center p-2 border-b border-gray-700';
            releaseEl.innerHTML = `<div><p class="font-bold">${release.title}</p><p class="text-sm text-gray-400">${release.date}</p></div>`;
            
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'text-neon text-sm';
            editBtn.onclick = () => {
                document.getElementById('press-form-title').textContent = 'Editing Release';
                pressPostId.value = doc.id;
                pressTitle.value = release.title;
                pressDate.value = release.date;
                pressSource.value = release.source || '';
                coverPhotoUrlInput.value = release.coverPhotoURL || '';
                document.getElementById('press-file-preview').innerHTML = release.coverPhotoURL ? `<img src="${release.coverPhotoURL}" class="h-16 mt-2 rounded">` : '';
                // *** FIX: Set Quill editor content ***
                pressEditor.root.innerHTML = release.summary;
                window.scrollTo(0, pressForm.offsetTop);
            };

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'text-red-500 text-sm ml-2';
            deleteBtn.onclick = async () => {
                if (confirm('Are you sure?')) {
                    await deleteDoc(doc.ref);
                    loadPressReleases();
                }
            };
            
            const btnContainer = document.createElement('div');
            btnContainer.appendChild(editBtn);
            btnContainer.appendChild(deleteBtn);
            releaseEl.appendChild(btnContainer);
            pressList.appendChild(releaseEl);
        });
    }

    pressForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = pressPostId.value;
        const data = {
            title: pressTitle.value,
            date: pressDate.value,
            // *** FIX: Get content from Quill editor ***
            summary: pressEditor.root.innerHTML,
            source: pressSource.value,
            coverPhotoURL: coverPhotoUrlInput.value,
        };

        if (id) {
            await updateDoc(doc(pressCollection, id), data);
        } else {
            await addDoc(pressCollection, data);
        }
        
        resetPressForm();
        alert('Press release saved!');
        loadPressReleases();
    });

    clearPressBtn.addEventListener('click', resetPressForm);
    loadPressReleases();
}