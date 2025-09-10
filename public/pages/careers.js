// FILE: public/pages/careers.js

import { db } from '../api/firebase.js';
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
// NEW: Import Firebase Storage functions
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";
import { app } from '../api/firebase.js'; // Import the initialized app

// NEW: Initialize Firebase Storage
const storage = getStorage(app);

// Modal Elements
const applicationModal = document.getElementById('application-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalJobTitle = document.getElementById('modal-job-title');
const applicationForm = document.getElementById('application-form');
const careersContainer = document.getElementById('careers-list-container');

// Functions to open/close modal (unchanged)
function openModal(jobTitle) {
    modalJobTitle.textContent = jobTitle;
    applicationModal.classList.remove('hidden');
}
function closeModal() {
    applicationModal.classList.add('hidden');
}

// Function to load job listings (unchanged)
async function loadCareersContent() {
    const careersCollection = collection(db, 'siteContent', 'careers', 'jobs');
    const q = query(careersCollection, orderBy('createdAt', 'desc'));
    try {
        const querySnapshot = await getDocs(q);
        careersContainer.innerHTML = '';
        if (querySnapshot.empty) {
            careersContainer.innerHTML = '<p class="text-center text-gray-500">No open positions at this time. Check back soon!</p>';
            return;
        }
        querySnapshot.forEach(doc => {
            const job = doc.data();
            const jobElement = document.createElement('div');
            jobElement.className = 'job-listing bg-[#121212] border border-gray-800 rounded-lg overflow-hidden';
            jobElement.innerHTML = `
                <div class="job-header cursor-pointer p-6 flex justify-between items-center hover:bg-gray-900 transition-colors">
                    <div>
                        <h3 class="font-headline text-xl font-bold text-white">${job.title}</h3>
                        <p class="text-gray-400 text-sm mt-1">${job.type} &bull; ${job.location}</p>
                    </div>
                    <div class="arrow text-neon"><svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg></div>
                </div>
                <div class="job-description border-t border-gray-800">
                    <div class="job-description-content">${job.description}</div>
                    <button data-job-title="${job.title}" class="apply-btn btn-neon py-2 px-6 rounded-lg font-semibold mt-4">Apply Now</button>
                </div>
            `;
            careersContainer.appendChild(jobElement);
        });
    } catch (error) {
        console.error("Error fetching careers content:", error);
        careersContainer.innerHTML = '<p class="text-center text-red-500">Could not load career opportunities.</p>';
    }
}

// Accordion and modal button listener (unchanged)
careersContainer.addEventListener('click', (event) => {
    const header = event.target.closest('.job-header');
    const applyButton = event.target.closest('.apply-btn');
    if (applyButton) {
        const jobTitle = applyButton.dataset.jobTitle;
        openModal(jobTitle);
        return;
    }
    if (header) {
        const listing = header.parentElement;
        const wasOpen = listing.classList.contains('open');
        document.querySelectorAll('.job-listing.open').forEach(openListing => {
            openListing.classList.remove('open');
        });
        if (!wasOpen) {
            listing.classList.add('open');
        }
    }
});

// Modal close listeners (unchanged)
closeModalBtn.addEventListener('click', closeModal);
applicationModal.addEventListener('click', (e) => {
    if (e.target === applicationModal) closeModal();
});


// *** REVISED: Fully functional form submission handler ***
applicationForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    
    // Get form data
    const jobTitle = modalJobTitle.textContent;
    const name = e.target.querySelector('input[type="text"]').value;
    const email = e.target.querySelector('input[type="email"]').value;
    const coverLetter = e.target.querySelector('textarea').value;
    const resumeFile = e.target.querySelector('input[type="file"]').files[0];

    if (!resumeFile) {
        alert('Please select a resume file to upload.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading Resume...';

    // 1. Upload the resume file to Firebase Storage
    const filePath = `resumes/${jobTitle.replace(/ /g, '_')}_${Date.now()}_${resumeFile.name}`;
    const storageRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, resumeFile);

    uploadTask.on('state_changed', 
        (snapshot) => {
            // Optional: update progress here
        },
        (error) => {
            console.error('Upload failed:', error);
            alert('Resume upload failed. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        },
        () => {
            // 2. When upload is complete, get the download URL
            getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
                submitBtn.textContent = 'Saving Application...';
                
                // 3. Save the application details to Firestore
                try {
                    await addDoc(collection(db, "applications"), {
                        jobTitle: jobTitle,
                        name: name,
                        email: email,
                        coverLetter: coverLetter,
                        resumeURL: downloadURL,
                        submittedAt: serverTimestamp()
                    });

                    submitBtn.textContent = 'Application Submitted!';
                    setTimeout(() => {
                        closeModal();
                        applicationForm.reset();
                        submitBtn.disabled = false;
                        submitBtn.textContent = originalBtnText;
                    }, 2000);

                } catch (error) {
                    console.error('Error saving application to Firestore:', error);
                    alert('There was an error saving your application. Please try again.');
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                }
            });
        }
    );
});


document.addEventListener('DOMContentLoaded', loadCareersContent);