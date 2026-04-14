window.calendarUtils = {
    downloadICS: (bookings) => {
        if (!bookings || bookings.length === 0) return;
        
        let icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Chi Wah Coordinator//ZH\r\n";
        
        bookings.forEach(b => {
            const dateStr = b.date.replace(/-/g, '');
            const [start, end] = b.timeSlot.split('-');
            const startTimeStr = start.replace(':', '') + '00';
            const endTimeStr = end.replace(':', '') + '00';
            
            icsContent += "BEGIN:VEVENT\r\n";
            icsContent += `DTSTART;TZID=Asia/Hong_Kong:${dateStr}T${startTimeStr}\r\n`;
            icsContent += `DTEND;TZID=Asia/Hong_Kong:${dateStr}T${endTimeStr}\r\n`;
            icsContent += `SUMMARY:智华自习室 RM${b.roomNumber}\r\n`;
            icsContent += `DESCRIPTION:预约干员: ${b.userName}\\n时间段: ${b.timeSlot}\\n类型: ${b.type === 'allocated' ? '系统分配' : '个人填报'}\r\n`;
            icsContent += "END:VEVENT\r\n";
        });
        
        icsContent += "END:VCALENDAR";
        
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `chiwah_bookings_${bookings[0].date}.ics`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};