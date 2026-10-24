/* ==========================================================================
   Takarivo — help.js
   Purpose: Accessible FAQ accordion, Contact Support form (creates a
   demo ticket), and placeholder ticket View actions. No backend —
   everything here is in-memory only and resets on page reload.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {

    /* ==========================================================================
       FAQ accordion — accessible, multiple panels can be open at once.
       Each trigger toggles its own panel via aria-expanded + hidden.
       ========================================================================== */
    const accordionTriggers = document.querySelectorAll(".accordion-trigger");

    accordionTriggers.forEach((trigger) => {
        trigger.addEventListener("click", () => {
            const panel = document.getElementById(trigger.getAttribute("aria-controls"));
            if (!panel) return;

            const isExpanded = trigger.getAttribute("aria-expanded") === "true";

            trigger.setAttribute("aria-expanded", String(!isExpanded));
            panel.hidden = isExpanded;
        });

        // Accordion triggers are <button> elements, so Enter/Space work natively —
        // no extra keydown handling needed for basic accessibility.
    });

    /* ==========================================================================
       Contact Support — validates and creates a demo support ticket
       ========================================================================== */
    const contactForm = document.getElementById("contact-support-form");
    const ticketSubject = document.getElementById("ticket-subject");
    const ticketCategory = document.getElementById("ticket-category");
    const ticketMessage = document.getElementById("ticket-message");

    const ticketErrors = {
        subject: document.getElementById("ticket-subject-error"),
        category: document.getElementById("ticket-category-error"),
        message: document.getElementById("ticket-message-error"),
    };

    const ticketsTableBody = document.getElementById("tickets-table-body");
    let nextTicketNumber = 1043; // continues on from the highest demo ticket (TCK-1042)

    const showFieldError = (field, errorEl) => {
        field.setAttribute("aria-invalid", "true");
        if (errorEl) errorEl.hidden = false;
    };

    const clearFieldError = (field, errorEl) => {
        field.removeAttribute("aria-invalid");
        if (errorEl) errorEl.hidden = true;
    };

    const validateContactForm = () => {
        let isValid = true;

        if (!ticketSubject.value.trim()) {
            showFieldError(ticketSubject, ticketErrors.subject);
            isValid = false;
        } else {
            clearFieldError(ticketSubject, ticketErrors.subject);
        }

        if (!ticketCategory.value) {
            showFieldError(ticketCategory, ticketErrors.category);
            isValid = false;
        } else {
            clearFieldError(ticketCategory, ticketErrors.category);
        }

        if (!ticketMessage.value.trim()) {
            showFieldError(ticketMessage, ticketErrors.message);
            isValid = false;
        } else {
            clearFieldError(ticketMessage, ticketErrors.message);
        }

        return isValid;
    };

    const formatToday = () => {
        const today = new Date();
        return today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    const addTicketRow = (subject) => {
        if (!ticketsTableBody) return;

        const ticketId = `TCK-${nextTicketNumber++}`;
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${ticketId}</td>
            <td>${subject}</td>
            <td><span class="status-tag in-progress">Open</span></td>
            <td>${formatToday()}</td>
            <td><button type="button" class="outline-button small-button ticket-view-btn">View</button></td>
        `;
        ticketsTableBody.prepend(row);

        row.querySelector(".ticket-view-btn")?.addEventListener("click", () => {
            console.log(`View clicked for: ${ticketId} — demo only, not yet connected.`);
        });
    };

    if (contactForm) {
        contactForm.addEventListener("submit", (event) => {
            event.preventDefault();

            if (!validateContactForm()) return;

            const subject = ticketSubject.value.trim();
            console.log("Support ticket created (demo only, not persisted):", {
                subject,
                category: ticketCategory.value,
                message: ticketMessage.value.trim(),
            });

            addTicketRow(subject);
            contactForm.reset();
        });
    }

    /* ==========================================================================
       Existing ticket View buttons — placeholder only
       ========================================================================== */
    document.querySelectorAll(".ticket-view-btn").forEach((button) => {
        button.addEventListener("click", () => {
            const row = button.closest("tr");
            const ticketId = row?.children[0]?.textContent ?? "Unknown ticket";
            console.log(`View clicked for: ${ticketId} — demo only, not yet connected.`);
        });
    });

});
