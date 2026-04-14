# Chi Wah Room Booking Coordination Platform

A transparent platform for sharing and coordinating room booking information at Chi Wah Learning Commons.

## Features
- **Transparency**: View who booked which room and when.
- **Coordination**: Swap time slots with other users.
- **Course Sharing**: Public schedule center for sharing class timetables.
- **Smart Scheduling**: Admin drag-and-drop allocation with conflict detection.
- **Roles**:
  - **User**: Submit bookings, request swaps, upload courses, view allocations.
  - **Admin**: Manage allocations via smart console and users.

## Project Structure
- `index.html`: Password-free Login & Registration.
- `dashboard.html`: Main dashboard.
- `submit.html`: Submit booking results.
- `swap.html`: Swap center.
- `courses.html`: Public course schedule center.
- `notifications.html`: User notifications.
- `profile.html`: User profile & history.
- `admin.html`: Admin smart scheduling console.

## Status
- **Auth**: Simplified password-free username login.
- **Courses**: Added `courses.html` for schedule management and public viewing.
- **Admin**: Updated with "Smart Scheduling" view. AI auto allocation supports customizable time ranges, targets any selected room, and restricts users to a maximum of 2 hours per day.
- **Push Notifications**: Implemented Web Push API and Native HTML5 Notifications. PWA configuration was removed in favor of native web experiences.
- **Calendar Integration**: Added pure frontend ICS generator, allowing automatic addition of bookings to the user's system calendar based on preferences.
- **Core**: Fully functional booking, swapping, and notification systems.
- **Live Radar**: Added "Live Occupancy Radar" to track real-time room usage and prevent overcrowding.
- **Interactive Sandbox Tutorial**: Implemented an in-page overlay tutorial system to guide new users through mock operations (Check-in, Reject, Quick Confirm, Swap, Course Management, and Profile Settings) safely without affecting real data.
