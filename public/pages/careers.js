// FILE: public/pages/careers.js

// *** FIX: Import the initialized 'db' instance from your central firebase.js file ***
import { db } from '../api/firebase.js';

// *** FIX: The other Firebase imports are still needed, but not initializeApp ***
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// *** REMOVED: The entire firebaseConfig object and the initializeApp() call have been deleted. ***

// Modal Elements (This part is unchanged)
const applicationModal = document.getElementById('application-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalJobTitle = document.getElementById('modal-job-title');
const applicationForm = document.getElementById('application-form');

function openModal(jobTitle) {
    modalJobTitle.textContent = jobTitle;
    applicationModal.classList.remove('hidden');
}

function closeModal() {
    applicationModal.classList.add('hidden');
}

async function loadCareersContent() {
    const careersCollection = collection(db, 'siteContent', 'careers', 'jobs');
    const careersContainer = document.getElementById('careers-list-container');
    
    try {
        const q = query(careersCollection, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            careersContainer.innerHTML = '<p class="text-center text-gray-500">No open positions at this time. Check back soon!</p>';
            return;
        }
        
        careersContainer.innerHTML = ''; // Clear loading message
        querySnapshot.forEach(doc => {
            const job = doc.data();
            const jobElement = document.createElement('div');
            jobElement.className = 'bg-[#121212] border border-gray-800 rounded-lg p-8';
            
            jobElement.innerHTML = `
                <div class="grid grid-cols-1 lg:grid-cols-3 lg:gap-16">
                    <div class="lg:col-span-2">
                        <h2 class="font-headline text-3xl font-bold text-white mb-6">${job.title}</h2>
                        <div class="job-description-content">
                            ${job.description}
                        </div>
                    </div>

                    <div class="relative mt-8 lg:mt-0">
                        <div class="lg:sticky lg:top-24">
                            <div class="bg-gray-900 border border-gray-700 rounded-lg p-6">
                                <h3 class="text-lg font-semibold text-white mb-4">Role Details</h3>
                                <div class="space-y-3 text-gray-300">
                                    <p><strong>Location:</strong> ${job.location}</p>
                                    <p><strong>Department:</strong> ${job.type}</p>
                                </div>
                                <button data-job-title="${job.title}" class="apply-btn btn-neon block w-full text-center py-3 mt-6 rounded-lg">
                                    Apply Now
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            careersContainer.appendChild(jobElement);
        });

    } catch (error) {
        console.error("Error fetching careers content:", error);
        careersContainer.innerHTML = '<p class="text-center text-red-500">Could not load career opportunities.</p>';
    }
}

// Event Listeners (This part is unchanged)
document.getElementById('careers-list-container').addEventListener('click', (event) => {
    const applyButton = event.target.closest('.apply-btn');
    if (applyButton) {
        const jobTitle = applyButton.dataset.jobTitle;
        openModal(jobTitle);
    }
});

closeModalBtn.addEventListener('click', closeModal);
applicationModal.addEventListener('click', (e) => {
    if (e.target === applicationModal) {
        closeModal();
    }
});
applicationForm.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Thank you for your application! (This is a demo)');
    closeModal();
    applicationForm.reset();
});

document.addEventListener('DOMContentLoaded', loadCareersContent);