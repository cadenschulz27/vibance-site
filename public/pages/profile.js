// FILE: public/pages/profile.js
import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const profileForm = document.getElementById('profile-form');
const saveButton = document.getElementById('save-button');

// Input fields
const primaryIncomeEl = document.getElementById('primaryIncome');
const additionalIncomeEl = document.getElementById('additionalIncome');
const stabilityEl = document.getElementById('stability');
const growthPotentialEl = document.getElementById('growthPotential');

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is signed in, load their data
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists() && userDoc.data().income) {
            const incomeData = userDoc.data().income;
            // Populate the form with existing data
            primaryIncomeEl.value = incomeData.primaryIncome || '';
            additionalIncomeEl.value = incomeData.additionalIncome || '';
            stabilityEl.value = incomeData.stability || 'medium';
            growthPotentialEl.value = incomeData.growthPotential || 'medium';
        }
    }
});

profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        alert("You must be logged in to save your profile.");
        return;
    }

    const originalButtonText = saveButton.textContent;
    saveButton.textContent = "Saving...";
    saveButton.disabled = true;

    // Prepare the data to be saved
    const incomeData = {
        primaryIncome: Number(primaryIncomeEl.value) || 0,
        additionalIncome: Number(additionalIncomeEl.value) || 0,
        stability: stabilityEl.value,
        growthPotential: growthPotentialEl.value
    };

    try {
        const userDocRef = doc(db, "users", user.uid);
        // Use setDoc with merge:true to update the document without overwriting other fields
        await setDoc(userDocRef, { income: incomeData }, { merge: true });

        saveButton.textContent = "Saved!";
        setTimeout(() => {
            saveButton.textContent = originalButtonText;
            saveButton.disabled = false;
        }, 2000);

    } catch (error) {
        console.error("Error saving profile:", error);
        alert("There was an error saving your profile. Please try again.");
        saveButton.textContent = originalButtonText;
        saveButton.disabled = false;
    }
});