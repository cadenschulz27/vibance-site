document.addEventListener('DOMContentLoaded', () => {
    const budgetTab = document.getElementById('budget-tab');
    const calendarTab = document.getElementById('calendar-tab');
    const budgetView = document.getElementById('budget-view');
    const calendarView = document.getElementById('calendar-view');

    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    const monthYearDisplay = document.getElementById('month-year');
    const calendarGrid = document.getElementById('calendar-grid');

    let currentDate = new Date();

    // --- Tab Switching Logic ---
    budgetTab.addEventListener('click', () => {
        budgetView.classList.add('active');
        calendarView.classList.remove('active');
        budgetTab.classList.add('active');
        calendarTab.classList.remove('active');
    });

    calendarTab.addEventListener('click', () => {
        calendarView.classList.add('active');
        budgetView.classList.remove('active');
        calendarTab.classList.add('active');
        budgetTab.classList.remove('active');
    });

    // --- Calendar Logic ---
    const renderCalendar = () => {
        calendarGrid.innerHTML = '';
        const month = currentDate.getMonth();
        const year = currentDate.getFullYear();

        monthYearDisplay.textContent = `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`;

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Add day headers
        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        daysOfWeek.forEach(day => {
            const dayEl = document.createElement('div');
            dayEl.classList.add('calendar-day', 'header');
            dayEl.textContent = day;
            calendarGrid.appendChild(dayEl);
        });

        // Add blank days for the start of the month
        for (let i = 0; i < firstDayOfMonth; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.classList.add('calendar-day', 'empty');
            calendarGrid.appendChild(emptyCell);
        }

        // Add days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            const dayCell = document.createElement('div');
            dayCell.classList.add('calendar-day');
            
            const dateNumber = document.createElement('span');
            dateNumber.classList.add('date-number');
            dateNumber.textContent = i;
            dayCell.appendChild(dateNumber);

            // Placeholder for spending
            const spending = document.createElement('div');
            spending.classList.add('day-spending');
            // Mock spending data for a few days
            if (i === 5) spending.textContent = '-$45.50';
            if (i === 12) spending.textContent = '-$120.00';
            if (i === 20) spending.textContent = '-$78.25';

            dayCell.appendChild(spending);
            calendarGrid.appendChild(dayCell);
        }
    };

    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });
    
    // Initial render
    renderCalendar();
});
