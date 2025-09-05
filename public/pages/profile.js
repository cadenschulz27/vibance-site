// FILE: public/pages/profile.js
import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const profileForm = document.getElementById('profile-form');
const saveButton = document.getElementById('save-button');

// Get all form elements
const elements = {
    // Income
    primaryIncome: document.getElementById('primaryIncome'),
    additionalIncome: document.getElementById('additionalIncome'),
    incomeStability: document.getElementById('incomeStability'),
    incomeGrowth: document.getElementById('incomeGrowth'),
    // Savings & Emergency Fund
    monthlySavingsRate: document.getElementById('monthlySavingsRate'),
    totalLiquidSavings: document.getElementById('totalLiquidSavings'),
    emergencyFundGoal: document.getElementById('emergencyFundGoal'),
    emergencyFundCurrent: document.getElementById('emergencyFundCurrent'),
    // Budgeting & Cash Flow
    avgMonthlyIncome: document.getElementById('avgMonthlyIncome'),
    avgMonthlySpending: document.getElementById('avgMonthlySpending'),
    avgMonthlySurplus: document.getElementById('avgMonthlySurplus'),
    budgetAdherence: document.getElementById('budgetAdherence'),
    // Credit & Debt
    creditScore: document.getElementById('creditScore'),
    creditUtilization: document.getElementById('creditUtilization'),
    paymentHistory: document.getElementById('paymentHistory'),
    totalDebt: document.getElementById('totalDebt'),
    dtiRatio: document.getElementById('dtiRatio'),
    hasHighInterestDebt: document.getElementById('hasHighInterestDebt'),
    // Investing & Retirement
    totalInvested: document.getElementById('totalInvested'),
    investingContribution: document.getElementById('investingContribution'),
    portfolioDiversity: document.getElementById('portfolioDiversity'),
    retirementValue: document.getElementById('retirementValue'),
    retirementContribution: document.getElementById('retirementContribution'),
    onTrackRetirement: document.getElementById('onTrackRetirement'),
    // Net Worth
    totalAssets: document.getElementById('totalAssets'),
    totalLiabilities: document.getElementById('totalLiabilities'),
};

// Function to populate the form with data from Firestore
function populateForm(userData) {
    const data = userData || {};
    // Each section corresponds to a map in the Firestore document
    const income = data.income || {};
    elements.primaryIncome.value = income.primaryIncome || '';
    elements.additionalIncome.value = income.additionalIncome || '';
    elements.incomeStability.value = income.stability || 'medium';
    elements.incomeGrowth.value = income.growthPotential || 'medium';

    const savings = data.savings || {};
    elements.monthlySavingsRate.value = savings.monthlySavingsRate || '';
    elements.totalLiquidSavings.value = savings.totalLiquidSavings || '';

    const emergencyFund = data.emergencyFund || {};
    elements.emergencyFundGoal.value = emergencyFund.goalMonths || '';
    elements.emergencyFundCurrent.value = emergencyFund.currentMonths || '';

    const budgeting = data.budgeting || {};
    elements.avgMonthlyIncome.value = budgeting.averageMonthlyIncome || '';
    elements.avgMonthlySpending.value = budgeting.averageMonthlySpending || '';
    elements.budgetAdherence.value = budgeting.budgetAdherence || 'flexible';

    const cashFlow = data.cashFlow || {};
    elements.avgMonthlySurplus.value = cashFlow.averageMonthlySurplus || '';
    
    const credit = data.credit || {};
    elements.creditScore.value = credit.scoreValue || '';
    elements.creditUtilization.value = credit.creditUtilization || '';
    elements.paymentHistory.value = credit.paymentHistory || 'good';

    const debt = data.debt || {};
    elements.totalDebt.value = debt.totalDebt || '';
    elements.dtiRatio.value = debt.debtToIncomeRatio || '';
    elements.hasHighInterestDebt.checked = debt.hasHighInterestDebt || false;

    const investing = data.investing || {};
    elements.totalInvested.value = investing.totalInvested || '';
    elements.investingContribution.value = investing.monthlyContribution || '';
    elements.portfolioDiversity.value = investing.portfolioDiversity || 'medium';

    const retirement = data.retirement || {};
    elements.retirementValue.value = retirement.retirementAccountValue || '';
    elements.retirementContribution.value = retirement.monthlyContributionPercent || '';
    elements.onTrackRetirement.checked = retirement.onTrackForGoal || false;

    const netWorth = data.netWorth || {};
    elements.totalAssets.value = netWorth.totalAssets || '';
    elements.totalLiabilities.value = netWorth.totalLiabilities || '';
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            populateForm(userDoc.data());
        }
    }
});

profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return alert("You must be logged in to save.");

    const originalButtonText = saveButton.textContent;
    saveButton.textContent = "Saving...";
    saveButton.disabled = true;

    // Construct the data object from form values
    const dataToSave = {
        income: {
            primaryIncome: Number(elements.primaryIncome.value) || 0,
            additionalIncome: Number(elements.additionalIncome.value) || 0,
            stability: elements.incomeStability.value,
            growthPotential: elements.incomeGrowth.value
        },
        savings: {
            monthlySavingsRate: Number(elements.monthlySavingsRate.value) || 0,
            totalLiquidSavings: Number(elements.totalLiquidSavings.value) || 0,
        },
        emergencyFund: {
            goalMonths: Number(elements.emergencyFundGoal.value) || 0,
            currentMonths: Number(elements.emergencyFundCurrent.value) || 0,
        },
        budgeting: {
            averageMonthlyIncome: Number(elements.avgMonthlyIncome.value) || 0,
            averageMonthlySpending: Number(elements.avgMonthlySpending.value) || 0,
            budgetAdherence: elements.budgetAdherence.value,
        },
        cashFlow: {
            averageMonthlySurplus: Number(elements.avgMonthlySurplus.value) || 0,
        },
        credit: {
            scoreValue: Number(elements.creditScore.value) || 0,
            creditUtilization: Number(elements.creditUtilization.value) || 0,
            paymentHistory: elements.paymentHistory.value,
        },
        debt: {
            totalDebt: Number(elements.totalDebt.value) || 0,
            debtToIncomeRatio: Number(elements.dtiRatio.value) || 0,
            hasHighInterestDebt: elements.hasHighInterestDebt.checked,
        },
        investing: {
            totalInvested: Number(elements.totalInvested.value) || 0,
            monthlyContribution: Number(elements.investingContribution.value) || 0,
            portfolioDiversity: elements.portfolioDiversity.value,
        },
        retirement: {
            retirementAccountValue: Number(elements.retirementValue.value) || 0,
            monthlyContributionPercent: Number(elements.retirementContribution.value) || 0,
            onTrackForGoal: elements.onTrackRetirement.checked,
        },
        netWorth: {
            totalAssets: Number(elements.totalAssets.value) || 0,
            totalLiabilities: Number(elements.totalLiabilities.value) || 0,
        },
    };

    try {
        const userDocRef = doc(db, "users", user.uid);
        await setDoc(userDocRef, dataToSave, { merge: true });

        saveButton.textContent = "Saved!";
        setTimeout(() => {
            saveButton.textContent = originalButtonText;
            saveButton.disabled = false;
        }, 2000);
    } catch (error) {
        console.error("Error saving profile:", error);
        alert("Error saving profile. Please try again.");
        saveButton.textContent = originalButtonText;
        saveButton.disabled = false;
    }
});