/* ==========================================================================
   Takarivo — navigation.js
   Purpose: All navigation-related interactivity for the app shell:
   - mobile sidebar (open/close, accessibility)
   - active navigation item detection
   - profile dropdown (open/close, outside click, Escape key)
   Vanilla ES6+. No frameworks, no backend calls.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {

    /* ==========================================================================
       Element references
       ========================================================================== */
    const sidebarLayout = document.querySelector(".sidebar-layout");
    const sidebar = document.querySelector(".sidebar");
    const menuToggle = document.getElementById("menu-toggle");

    const profileTrigger = document.getElementById("profile-trigger");
    const profileDropdown = document.getElementById("profile-dropdown");

    /* ==========================================================================
       Active navigation item
       Compares each sidebar link's href against the current page URL and
       marks the matching one as active. Keeps the sidebar markup reusable
       across pages instead of hardcoding aria-current in every HTML file.
       ========================================================================== */
    const setActiveNavItem = () => {
        const navLinks = document.querySelectorAll(".sidebar-nav a");
        const currentPage = window.location.pathname.split("/").pop();

        navLinks.forEach((link) => {
            const linkPage = link.getAttribute("href");

            if (linkPage === currentPage) {
                link.setAttribute("aria-current", "page");
            } else {
                link.removeAttribute("aria-current");
            }
        });
    };

    /* ==========================================================================
       Mobile sidebar — open
       ========================================================================== */
    const openSidebar = () => {
        if (!sidebarLayout || !menuToggle) return;

        sidebarLayout.classList.add("sidebar-open");
        menuToggle.setAttribute("aria-expanded", "true");
        menuToggle.setAttribute("aria-label", "Close menu");

        // Move focus into the sidebar for keyboard users
        const firstLink = sidebar?.querySelector("a, button");
        firstLink?.focus();
    };

    /* ==========================================================================
       Mobile sidebar — close
       ========================================================================== */
    const closeSidebar = () => {
        if (!sidebarLayout || !menuToggle) return;

        sidebarLayout.classList.remove("sidebar-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Open menu");
    };

    const isSidebarOpen = () => sidebarLayout?.classList.contains("sidebar-open") ?? false;

    if (menuToggle && sidebarLayout) {
        menuToggle.addEventListener("click", () => {
            isSidebarOpen() ? closeSidebar() : openSidebar();
        });
    }

    // Close the mobile sidebar when clicking outside of it
    document.addEventListener("click", (event) => {
        if (!isSidebarOpen()) return;

        const clickedInsideSidebar = sidebar?.contains(event.target);
        const clickedToggle = menuToggle?.contains(event.target);

        if (!clickedInsideSidebar && !clickedToggle) {
            closeSidebar();
            menuToggle?.focus();
        }
    });

    /* ==========================================================================
       Profile dropdown
       ========================================================================== */
    const isDropdownOpen = () => profileDropdown ? !profileDropdown.hidden : false;

    const openDropdown = () => {
        if (!profileDropdown || !profileTrigger) return;
        profileDropdown.hidden = false;
        profileTrigger.setAttribute("aria-expanded", "true");
    };

    const closeDropdown = () => {
        if (!profileDropdown || !profileTrigger) return;
        profileDropdown.hidden = true;
        profileTrigger.setAttribute("aria-expanded", "false");
    };

    if (profileTrigger && profileDropdown) {
        profileTrigger.addEventListener("click", (event) => {
            event.stopPropagation();
            isDropdownOpen() ? closeDropdown() : openDropdown();
        });

        // Close the dropdown when clicking outside of it
        document.addEventListener("click", (event) => {
            if (isDropdownOpen() && !profileDropdown.contains(event.target)) {
                closeDropdown();
            }
        });
    }

    /* ==========================================================================
       Escape key — closes whichever is open (dropdown takes priority,
       since it's usually the "topmost" open element)
       ========================================================================== */
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;

        if (isDropdownOpen()) {
            closeDropdown();
            profileTrigger?.focus();
            return;
        }

        if (isSidebarOpen()) {
            closeSidebar();
            menuToggle?.focus();
        }
    });

    /* ==========================================================================
       Init
       ========================================================================== */
    setActiveNavItem();

});
