// FILE: public/pages/careers.js

import { db } from '../api/firebase.js';
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Modal Elements
const applicationModal = document.getElementById('application-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalJobTitle = document.getElementById('modal-job-title');
const applicationForm = document.getElementById('application-form');
const careersContainer = document.getElementById('careers-list-container');

function openModal(jobTitle) {
    modalJobTitle.textContent = jobTitle;
    applicationModal.classList.remove('hidden');
}

function closeModal() {
    applicationModal.classList.add('hidden');
}

async function loadCareersContent() {
    const careersCollection = collection(db, 'siteContent', 'careers', 'jobs');
    const q = query(careersCollection, orderBy('createdAt', 'desc'));

    try {
        const querySnapshot = await getDocs(q);
        careersContainer.innerHTML = ''; // Clear loading message

        if (querySnapshot.empty) {
            careersContainer.innerHTML = '<p class="text-center text-gray-500">No open positions at this time. Check back soon!</p>';
            return;
        }

        querySnapshot.forEach(doc => {
            const job = doc.data();
            const jobElement = document.createElement('div');
            // This class is the main container for one job listing
            jobElement.className = 'job-listing bg-[#121212] border border-gray-800 rounded-lg overflow-hidden';
            
            // REVISED: HTML structure for the accordion layout
            jobElement.innerHTML = `
                <div class="job-header cursor-pointer p-6 flex justify-between items-center hover:bg-gray-900 transition-colors">
                    <div>
                        <h3 class="font-headline text-xl font-bold text-white">${job.title}</h3>
                        <p class="text-gray-400 text-sm mt-1">${job.type} &bull; ${job.location}</p>
                    </div>
                    <div class="arrow text-neon">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>

                <div class="job-description border-t border-gray-800">
                    <div class="job-description-content">
                        ${job.description}
                    </div>
                    <button data-job-title="${job.title}" class="apply-btn btn-neon py-2 px-6 rounded-lg font-semibold mt-4">
                        Apply Now
                    </button>
                </div>
            `;
            careersContainer.appendChild(jobElement);
        });

    } catch (error) {
        console.error("Error fetching careers content:", error);
        careersContainer.innerHTML = '<p class="text-center text-red-500">Could not load career opportunities.</p>';
    }
}

// REVISED: Event listener to handle both accordion and modal button clicks
careersContainer.addEventListener('click', (event) => {
    const header = event.target.closest('.job-header');
    const applyButton = event.target.closest('.apply-btn');

    // If an "Apply Now" button was clicked
    if (applyButton) {
        const jobTitle = applyButton.dataset.jobTitle;
        openModal(jobTitle);
        return; // Stop further processing
    }

    // If a job header was clicked
    if (header) {
        const listing = header.parentElement;
        const wasOpen = listing.classList.contains('open');

        // Close all other open listings for a cleaner experience
        document.querySelectorAll('.job-listing.open').forEach(openListing => {
            openListing.classList.remove('open');
        });

        // If the clicked listing was not already open, open it
        if (!wasOpen) {
            listing.classList.add('open');
        }
    }
});

// Modal event listeners (Unchanged)
closeModalBtn.addEventListener('click', closeModal);
applicationModal.addEventListener('click', (e) => {
    if (e.target === applicationModal) closeModal();
});
applicationForm.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Thank you for your application! (This is a demo)');
    closeModal();
    applicationForm.reset();
});

document.addEventListener('DOMContentLoaded', loadCareersContent);