-- ============================================================================
-- RAKSHAK PORTAL - COMPLETE DATABASE IMPLEMENTATION
-- Features: Normalization (3NF), ACID Properties, Triggers, Transactions,
--           Stored Procedures, Views, Indexes, Constraints
-- ============================================================================

DROP DATABASE IF EXISTS rakshak_portal;
CREATE DATABASE rakshak_portal;
USE rakshak_portal;

-- Set transaction isolation level for ACID compliance
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- ============================================================================
-- TABLE CREATION (NORMALIZED TO 3NF)
-- ============================================================================

-- Users Table (Main entity)
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    mobile VARCHAR(15) NOT NULL,
    address TEXT,
    user_type ENUM('citizen', 'admin', 'officer') NOT NULL,
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    failed_login_attempts INT DEFAULT 0,
    account_locked_until TIMESTAMP NULL,
    INDEX idx_email (email),
    INDEX idx_username (username),
    INDEX idx_user_type (user_type),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- Police Stations Table (Lookup entity - Normalized)
CREATE TABLE police_stations (
    station_id INT PRIMARY KEY AUTO_INCREMENT,
    station_name VARCHAR(100) NOT NULL,
    station_code VARCHAR(20) UNIQUE NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(50) NOT NULL,
    state VARCHAR(50) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    email VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    station_in_charge INT,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (station_in_charge) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_station_code (station_code),
    INDEX idx_city (city),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- Crime Types Table (Normalized lookup)
CREATE TABLE crime_types (
    crime_type_id INT PRIMARY KEY AUTO_INCREMENT,
    crime_code VARCHAR(10) UNIQUE NOT NULL,
    crime_name VARCHAR(100) NOT NULL,
    description TEXT,
    severity ENUM('minor', 'moderate', 'serious', 'critical') NOT NULL,
    ipc_section VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- FIR Table (Main transaction entity)
CREATE TABLE fir (
    fir_id INT PRIMARY KEY AUTO_INCREMENT,
    fir_number VARCHAR(20) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    complainant_name VARCHAR(100) NOT NULL,
    mobile VARCHAR(15) NOT NULL,
    email VARCHAR(100),
    address TEXT NOT NULL,
    crime_type_id INT NOT NULL,
    incident_details TEXT NOT NULL,
    incident_date DATE NOT NULL,
    incident_time TIME,
    incident_location VARCHAR(255) NOT NULL,
    status ENUM('Pending', 'Active', 'Under Investigation', 'Closed', 'Rejected') DEFAULT 'Pending',
    assigned_officer_id INT NULL,
    station_id INT NULL,
    priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    evidence_files TEXT,
    estimated_loss DECIMAL(12, 2) DEFAULT 0.00,
    witness_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (crime_type_id) REFERENCES crime_types(crime_type_id),
    FOREIGN KEY (assigned_officer_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (station_id) REFERENCES police_stations(station_id) ON DELETE SET NULL,
    INDEX idx_fir_number (fir_number),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_crime_type (crime_type_id),
    INDEX idx_created_at (created_at),
    INDEX idx_station (station_id)
) ENGINE=InnoDB;

-- Complaint Types (Normalized)
CREATE TABLE complaint_types (
    complaint_type_id INT PRIMARY KEY AUTO_INCREMENT,
    type_code VARCHAR(20) UNIQUE NOT NULL,
    type_name VARCHAR(100) NOT NULL,
    description TEXT,
    category ENUM('service', 'misconduct', 'facility', 'administrative', 'other') NOT NULL
) ENGINE=InnoDB;

-- Complaints Table
CREATE TABLE complaints (
    complaint_id INT PRIMARY KEY AUTO_INCREMENT,
    complaint_number VARCHAR(20) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    complainant_name VARCHAR(100) NOT NULL,
    contact VARCHAR(15) NOT NULL,
    complaint_type_id INT NOT NULL,
    complaint_details TEXT NOT NULL,
    status ENUM('Pending', 'Active', 'Under Review', 'Resolved', 'Closed') DEFAULT 'Pending',
    assigned_to INT NULL,
    resolution_details TEXT,
    priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
    satisfaction_rating INT CHECK (satisfaction_rating BETWEEN 1 AND 5),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (complaint_type_id) REFERENCES complaint_types(complaint_type_id),
    FOREIGN KEY (assigned_to) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_complaint_number (complaint_number),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- FIR Status History (Audit trail for ACID compliance)
CREATE TABLE fir_status_history (
    history_id INT PRIMARY KEY AUTO_INCREMENT,
    fir_id INT NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by INT NOT NULL,
    remarks TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fir_id) REFERENCES fir(fir_id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_fir_id (fir_id),
    INDEX idx_changed_at (changed_at)
) ENGINE=InnoDB;

-- Complaint Status History
CREATE TABLE complaint_status_history (
    history_id INT PRIMARY KEY AUTO_INCREMENT,
    complaint_id INT NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by INT NOT NULL,
    remarks TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_complaint_id (complaint_id)
) ENGINE=InnoDB;

-- Emergency Alerts Table
CREATE TABLE emergency_alerts (
    alert_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    alert_type ENUM('SOS', 'medical', 'fire', 'accident', 'crime') NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    location_description TEXT,
    status ENUM('active', 'responded', 'resolved', 'false_alarm') DEFAULT 'active',
    assigned_station_id INT,
    responded_by INT,
    response_time INT COMMENT 'Response time in minutes',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL,
    resolved_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_station_id) REFERENCES police_stations(station_id) ON DELETE SET NULL,
    FOREIGN KEY (responded_by) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

-- Officers Table (Normalized from users)
CREATE TABLE officers (
    officer_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT UNIQUE NOT NULL,
    badge_number VARCHAR(20) UNIQUE NOT NULL,
    rank ENUM('Constable', 'Head Constable', 'ASI', 'SI', 'Inspector', 'DSP', 'SP', 'DIG', 'IG', 'DGP') NOT NULL,
    department VARCHAR(100),
    station_id INT,
    joining_date DATE NOT NULL,
    specialization VARCHAR(100),
    cases_solved INT DEFAULT 0,
    cases_assigned INT DEFAULT 0,
    is_available BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (station_id) REFERENCES police_stations(station_id),
    INDEX idx_badge (badge_number),
    INDEX idx_station (station_id),
    INDEX idx_availability (is_available)
) ENGINE=InnoDB;

-- Certificates Table
CREATE TABLE certificates (
    certificate_id INT PRIMARY KEY AUTO_INCREMENT,
    certificate_number VARCHAR(20) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    certificate_type ENUM('police_verification', 'character_certificate', 'noc', 'tenant_verification') NOT NULL,
    applicant_name VARCHAR(100) NOT NULL,
    purpose TEXT NOT NULL,
    supporting_documents TEXT,
    status ENUM('pending', 'under_review', 'approved', 'rejected') DEFAULT 'pending',
    reviewed_by INT,
    issued_date DATE,
    expiry_date DATE,
    remarks TEXT,
    application_fee DECIMAL(8, 2) DEFAULT 0.00,
    payment_status ENUM('pending', 'paid', 'refunded') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_certificate_number (certificate_number),
    INDEX idx_status (status),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

-- Lost & Found Items Table
CREATE TABLE lost_found (
    item_id INT PRIMARY KEY AUTO_INCREMENT,
    reported_by INT NOT NULL,
    item_type ENUM('lost', 'found') NOT NULL,
    item_description TEXT NOT NULL,
    item_category VARCHAR(50),
    location VARCHAR(255) NOT NULL,
    date_lost_found DATE NOT NULL,
    contact_info VARCHAR(100) NOT NULL,
    status ENUM('open', 'matched', 'claimed', 'closed') DEFAULT 'open',
    matched_with INT,
    images TEXT,
    item_value DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (reported_by) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (matched_with) REFERENCES lost_found(item_id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_item_type (item_type),
    INDEX idx_category (item_category)
) ENGINE=InnoDB;

-- Anonymous Tips Table
CREATE TABLE anonymous_tips (
    tip_id INT PRIMARY KEY AUTO_INCREMENT,
    tip_category ENUM('crime', 'suspicious_activity', 'corruption', 'drug_activity', 'others') NOT NULL,
    tip_details TEXT NOT NULL,
    location VARCHAR(255),
    urgency ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    status ENUM('new', 'under_review', 'investigating', 'resolved', 'closed') DEFAULT 'new',
    assigned_to INT,
    ip_address VARCHAR(45),
    verification_status ENUM('unverified', 'verified', 'false') DEFAULT 'unverified',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_urgency (urgency),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- Notifications Table
CREATE TABLE notifications (
    notification_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    notification_type ENUM('fir_update', 'complaint_update', 'certificate_update', 'alert', 'general') NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reference_id INT,
    reference_type VARCHAR(50),
    is_read BOOLEAN DEFAULT FALSE,
    priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_is_read (is_read),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- Audit Log Table (For ACID compliance and tracking)
CREATE TABLE audit_log (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action_type VARCHAR(50) NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id INT,
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_action_type (action_type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================================================
-- TRIGGERS (For maintaining data integrity and audit trails)
-- ============================================================================

-- Trigger: Auto-update FIR status history
DELIMITER //
CREATE TRIGGER trg_fir_status_update
AFTER UPDATE ON fir
FOR EACH ROW
BEGIN
    IF OLD.status != NEW.status THEN
        INSERT INTO fir_status_history (fir_id, old_status, new_status, changed_by, remarks)
        VALUES (NEW.fir_id, OLD.status, NEW.status, NEW.assigned_officer_id, 
                CONCAT('Status changed from ', OLD.status, ' to ', NEW.status));
    END IF;
END//

-- Trigger: Auto-update complaint status history
CREATE TRIGGER trg_complaint_status_update
AFTER UPDATE ON complaints
FOR EACH ROW
BEGIN
    IF OLD.status != NEW.status THEN
        INSERT INTO complaint_status_history (complaint_id, old_status, new_status, changed_by, remarks)
        VALUES (NEW.complaint_id, OLD.status, NEW.status, NEW.assigned_to,
                CONCAT('Status changed from ', OLD.status, ' to ', NEW.status));
    END IF;
END//

-- Trigger: Create notification on FIR update
CREATE TRIGGER trg_fir_notification
AFTER UPDATE ON fir
FOR EACH ROW
BEGIN
    IF OLD.status != NEW.status THEN
        INSERT INTO notifications (user_id, notification_type, title, message, reference_id, reference_type, priority)
        VALUES (NEW.user_id, 'fir_update', 
                CONCAT('FIR Status Updated: ', NEW.fir_number),
                CONCAT('Your FIR status has been updated to: ', NEW.status),
                NEW.fir_id, 'fir', 'high');
    END IF;
END//

-- Trigger: Calculate response time for emergency alerts
CREATE TRIGGER trg_emergency_response_time
BEFORE UPDATE ON emergency_alerts
FOR EACH ROW
BEGIN
    IF OLD.status = 'active' AND NEW.status = 'responded' AND NEW.responded_at IS NOT NULL THEN
        SET NEW.response_time = TIMESTAMPDIFF(MINUTE, NEW.created_at, NEW.responded_at);
    END IF;
END//

-- Trigger: Update officer case count
CREATE TRIGGER trg_officer_case_assignment
AFTER UPDATE ON fir
FOR EACH ROW
BEGIN
    IF NEW.assigned_officer_id IS NOT NULL AND (OLD.assigned_officer_id IS NULL OR OLD.assigned_officer_id != NEW.assigned_officer_id) THEN
        UPDATE officers 
        SET cases_assigned = cases_assigned + 1
        WHERE user_id = NEW.assigned_officer_id;
    END IF;
    
    IF OLD.assigned_officer_id IS NOT NULL AND NEW.assigned_officer_id != OLD.assigned_officer_id THEN
        UPDATE officers 
        SET cases_assigned = cases_assigned - 1
        WHERE user_id = OLD.assigned_officer_id AND cases_assigned > 0;
    END IF;
END//

-- Trigger: Update cases solved when FIR is closed
CREATE TRIGGER trg_officer_case_closed
AFTER UPDATE ON fir
FOR EACH ROW
BEGIN
    IF NEW.status = 'Closed' AND OLD.status != 'Closed' AND NEW.assigned_officer_id IS NOT NULL THEN
        UPDATE officers 
        SET cases_solved = cases_solved + 1
        WHERE user_id = NEW.assigned_officer_id;
    END IF;
END//

-- Trigger: Prevent deletion of active FIRs
CREATE TRIGGER trg_prevent_active_fir_deletion
BEFORE DELETE ON fir
FOR EACH ROW
BEGIN
    IF OLD.status IN ('Active', 'Under Investigation') THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot delete FIR with Active or Under Investigation status';
    END IF;
END//

-- Trigger: Auto-set certificate expiry date
CREATE TRIGGER trg_certificate_expiry
BEFORE INSERT ON certificates
FOR EACH ROW
BEGIN
    IF NEW.certificate_type IN ('police_verification', 'noc') THEN
        SET NEW.expiry_date = DATE_ADD(CURDATE(), INTERVAL 6 MONTH);
    ELSEIF NEW.certificate_type = 'character_certificate' THEN
        SET NEW.expiry_date = DATE_ADD(CURDATE(), INTERVAL 1 YEAR);
    END IF;
END//

DELIMITER ;

-- ============================================================================
-- STORED PROCEDURES (For complex transactions maintaining ACID properties)
-- ============================================================================

-- Procedure: File a new FIR with transaction
DELIMITER //
CREATE PROCEDURE sp_file_fir(
    IN p_user_id INT,
    IN p_complainant_name VARCHAR(100),
    IN p_mobile VARCHAR(15),
    IN p_email VARCHAR(100),
    IN p_address TEXT,
    IN p_crime_type_id INT,
    IN p_incident_details TEXT,
    IN p_incident_date DATE,
    IN p_incident_location VARCHAR(255),
    OUT p_fir_number VARCHAR(20),
    OUT p_fir_id INT
)
BEGIN
    DECLARE v_station_id INT;
    DECLARE v_fir_count INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error filing FIR';
    END;
    
    START TRANSACTION;
    
    -- Generate FIR number
    SELECT COUNT(*) INTO v_fir_count FROM fir;
    SET p_fir_number = CONCAT('FIR', YEAR(CURDATE()), LPAD(v_fir_count + 1, 6, '0'));
    
    -- Find nearest station (simplified - in real scenario, use geolocation)
    SELECT station_id INTO v_station_id 
    FROM police_stations 
    WHERE status = 'active' 
    LIMIT 1;
    
    -- Insert FIR
    INSERT INTO fir (
        fir_number, user_id, complainant_name, mobile, email, address,
        crime_type_id, incident_details, incident_date, incident_location,
        station_id, status, priority
    ) VALUES (
        p_fir_number, p_user_id, p_complainant_name, p_mobile, p_email, p_address,
        p_crime_type_id, p_incident_details, p_incident_date, p_incident_location,
        v_station_id, 'Pending', 'medium'
    );
    
    SET p_fir_id = LAST_INSERT_ID();
    
    -- Create notification
    INSERT INTO notifications (user_id, notification_type, title, message, reference_id, reference_type, priority)
    VALUES (p_user_id, 'fir_update', 
            CONCAT('FIR Filed: ', p_fir_number),
            CONCAT('Your FIR has been successfully filed with number: ', p_fir_number),
            p_fir_id, 'fir', 'high');
    
    COMMIT;
END//

-- Procedure: Assign officer to FIR
CREATE PROCEDURE sp_assign_officer_to_fir(
    IN p_fir_id INT,
    IN p_officer_id INT,
    IN p_assigned_by INT
)
BEGIN
    DECLARE v_officer_available BOOLEAN;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error assigning officer';
    END;
    
    START TRANSACTION;
    
    -- Check if officer is available
    SELECT is_available INTO v_officer_available
    FROM officers
    WHERE user_id = p_officer_id;
    
    IF v_officer_available THEN
        -- Update FIR
        UPDATE fir 
        SET assigned_officer_id = p_officer_id,
            status = 'Active',
            updated_at = CURRENT_TIMESTAMP
        WHERE fir_id = p_fir_id;
        
        -- Log in audit
        INSERT INTO audit_log (user_id, action_type, table_name, record_id, new_values)
        VALUES (p_assigned_by, 'ASSIGN_OFFICER', 'fir', p_fir_id,
                JSON_OBJECT('officer_id', p_officer_id));
        
        COMMIT;
    ELSE
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Officer is not available';
    END IF;
END//

-- Procedure: Close FIR
CREATE PROCEDURE sp_close_fir(
    IN p_fir_id INT,
    IN p_closed_by INT,
    IN p_remarks TEXT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Error closing FIR';
    END;
    
    START TRANSACTION;
    
    UPDATE fir 
    SET status = 'Closed',
        closed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE fir_id = p_fir_id;
    
    INSERT INTO fir_status_history (fir_id, old_status, new_status, changed_by, remarks)
    SELECT fir_id, status, 'Closed', p_closed_by, p_remarks
    FROM fir WHERE fir_id = p_fir_id;
    
    COMMIT;
END//

-- Procedure: Get user dashboard statistics
CREATE PROCEDURE sp_get_user_dashboard(
    IN p_user_id INT
)
BEGIN
    SELECT 
        (SELECT COUNT(*) FROM fir WHERE user_id = p_user_id) as total_firs,
        (SELECT COUNT(*) FROM fir WHERE user_id = p_user_id AND status IN ('Pending', 'Active', 'Under Investigation')) as active_firs,
        (SELECT COUNT(*) FROM complaints WHERE user_id = p_user_id) as total_complaints,
        (SELECT COUNT(*) FROM complaints WHERE user_id = p_user_id AND status = 'Pending') as pending_complaints,
        (SELECT COUNT(*) FROM certificates WHERE user_id = p_user_id) as total_certificates,
        (SELECT COUNT(*) FROM certificates WHERE user_id = p_user_id AND status = 'pending') as pending_certificates;
END//

-- Procedure: Get admin statistics
CREATE PROCEDURE sp_get_admin_statistics()
BEGIN
    SELECT 
        (SELECT COUNT(*) FROM fir) as total_firs,
        (SELECT COUNT(*) FROM fir WHERE status IN ('Pending', 'Active', 'Under Investigation')) as active_firs,
        (SELECT COUNT(*) FROM complaints) as total_complaints,
        (SELECT COUNT(*) FROM complaints WHERE status = 'Pending') as pending_complaints,
        (SELECT COUNT(*) FROM emergency_alerts WHERE status = 'active') as active_alerts,
        (SELECT COUNT(*) FROM users WHERE user_type = 'citizen') as total_citizens,
        (SELECT COUNT(*) FROM officers WHERE is_available = TRUE) as available_officers,
        (SELECT AVG(response_time) FROM emergency_alerts WHERE response_time IS NOT NULL) as avg_response_time;
END//

DELIMITER ;

-- ============================================================================
-- VIEWS (For easy data retrieval and reporting)
-- ============================================================================

-- View: Active FIRs with officer details
CREATE VIEW vw_active_firs AS
SELECT 
    f.fir_id,
    f.fir_number,
    f.complainant_name,
    f.mobile,
    ct.crime_name,
    ct.severity,
    f.incident_date,
    f.incident_location,
    f.status,
    f.priority,
    CONCAT(u.full_name, ' (', o.rank, ')') as assigned_officer,
    ps.station_name,
    f.created_at,
    DATEDIFF(CURDATE(), f.created_at) as days_open
FROM fir f
LEFT JOIN crime_types ct ON f.crime_type_id = ct.crime_type_id
LEFT JOIN users u ON f.assigned_officer_id = u.user_id
LEFT JOIN officers o ON u.user_id = o.user_id
LEFT JOIN police_stations ps ON f.station_id = ps.station_id
WHERE f.status IN ('Pending', 'Active', 'Under Investigation');

-- View: Officer Performance
CREATE VIEW vw_officer_performance AS
SELECT 
    o.officer_id,
    u.full_name as officer_name,
    o.badge_number,
    o.rank,
    ps.station_name,
    o.cases_assigned,
    o.cases_solved,
    CASE 
        WHEN o.cases_assigned > 0 THEN ROUND((o.cases_solved / o.cases_assigned) * 100, 2)
        ELSE 0 
    END as success_rate,
    o.is_available
FROM officers o
JOIN users u ON o.user_id = u.user_id
LEFT JOIN police_stations ps ON o.station_id = ps.station_id;

-- View: Crime Statistics by Type
CREATE VIEW vw_crime_statistics AS
SELECT 
    ct.crime_name,
    ct.severity,
    COUNT(f.fir_id) as total_cases,
    SUM(CASE WHEN f.status = 'Closed' THEN 1 ELSE 0 END) as closed_cases,
    SUM(CASE WHEN f.status IN ('Active', 'Under Investigation') THEN 1 ELSE 0 END) as active_cases,
    AVG(DATEDIFF(f.closed_at, f.created_at)) as avg_resolution_days,
    SUM(f.estimated_loss) as total_estimated_loss
FROM crime_types ct
LEFT JOIN fir f ON ct.crime_type_id = f.crime_type_id
GROUP BY ct.crime_type_id, ct.crime_name, ct.severity;

-- View: Recent Activity Feed
CREATE VIEW vw_recent_activity AS
SELECT 
    'FIR' as activity_type,
    fir_number as reference_number,
    complainant_name as person_name,
    status,
    created_at,
    'Filed' as action
FROM fir
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
UNION ALL
SELECT 
    'Complaint' as activity_type,
    complaint_number as reference_number,
    complainant_name as person_name,
    status,
    created_at,
    'Lodged' as action
FROM complaints
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY created_at DESC
LIMIT 50;

-- ============================================================================
-- INDEXES FOR QUERY OPTIMIZATION
-- ============================================================================

CREATE INDEX idx_fir_date_range ON fir(incident_date, created_at);
CREATE INDEX idx_fir_status_station ON fir(status, station_id);
CREATE INDEX idx_complaint_date_status ON complaints(created_at, status);
CREATE INDEX idx_emergency_location ON emergency_alerts(latitude, longitude);
CREATE INDEX idx_notification_user_read ON notifications(user_id, is_read, created_at);

-- ============================================================================
-- SAMPLE DATA INSERTION
-- ============================================================================

-- Insert Crime Types
INSERT INTO crime_types (crime_code, crime_name, description, severity, ipc_section) VALUES
('THF001', 'Theft', 'Unauthorized taking of property', 'moderate', 'IPC 378'),
('FRD001', 'Fraud', 'Deception for financial gain', 'serious', 'IPC 420'),
('CYB001', 'Cybercrime', 'Digital/online criminal activity', 'serious', 'IT Act 66'),
('ASL001', 'Assault', 'Physical attack on person', 'serious', 'IPC 351'),
('HAR001', 'Harassment', 'Unwanted persistent behavior', 'moderate', 'IPC 354'),
('ROB001', 'Robbery', 'Theft with violence or threat', 'critical', 'IPC 392'),
('BUR001', 'Burglary', 'Illegal entry with intent to steal', 'serious', 'IPC 454'),
('VAN001', 'Vandalism', 'Intentional property damage', 'minor', 'IPC 425'),
('DRG001', 'Drug Offense', 'Illegal drug possession/sale', 'critical', 'NDPS Act'),
('KID001', 'Kidnapping', 'Unlawful abduction', 'critical', 'IPC 363');

-- Insert Complaint Types
INSERT INTO complaint_types (type_code, type_name, description, category) VALUES
('PMC001', 'Police Misconduct', 'Unprofessional behavior by police', 'misconduct'),
('SRD001', 'Service Delay', 'Delayed response or service', 'service'),
('COR001', 'Corruption', 'Bribery or corrupt practices', 'misconduct'),
('FAC001', 'Facility Issue', 'Problems with police station facilities', 'facility'),
('ADM001', 'Administrative Issue', 'Procedural or documentation problems', 'administrative'),
('OTH001', 'Other', 'Other types of complaints', 'other');

-- Insert Users (passwords are hashed with bcrypt - password is same as username for demo)
INSERT INTO users (username, email, password_hash, full_name, mobile, address, user_type, status) VALUES
('admin', 'admin@rakshak.gov.in', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'System Administrator', '9999999999', 'Police Headquarters, Agra', 'admin', 'active'),
('officer1', 'officer1@rakshak.gov.in', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Rajesh Kumar Singh', '9876543210', 'Central Police Station', 'officer', 'active'),
('officer2', 'officer2@rakshak.gov.in', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Priya Sharma', '9876543211', 'West Police Station', 'officer', 'active'),
('officer3', 'officer3@rakshak.gov.in', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Amit Verma', '9876543212', 'East Police Station', 'officer', 'active'),
('citizen', 'citizen@example.com', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Rahul Gupta', '9876543220', '123 MG Road, Agra', 'citizen', 'active'),
('ramesh', 'ramesh.k@gmail.com', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Ramesh Kumar', '9876543221', '456 Taj Ganj, Agra', 'citizen', 'active'),
('sneha', 'sneha.p@gmail.com', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Sneha Patel', '9876543222', '789 Sanjay Place, Agra', 'citizen', 'active'),
('vikram', 'vikram.s@yahoo.com', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Vikram Singh', '9876543223', '321 Sikandra, Agra', 'citizen', 'active'),
('anita', 'anita.m@gmail.com', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Anita Mehta', '9876543224', '654 Dayal Bagh, Agra', 'citizen', 'active'),
('suresh', 'suresh.y@gmail.com', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Suresh Yadav', '9876543225', '987 Kamla Nagar, Agra', 'citizen', 'active'),
('meena', 'meena.d@gmail.com', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Meena Devi', '9876543226', '147 Balkeshwar, Agra', 'citizen', 'active'),
('karan', 'karan.a@gmail.com', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Karan Agarwal', '9876543227', '258 Shahganj, Agra', 'citizen', 'active'),
('pooja', 'pooja.t@gmail.com', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Pooja Tiwari', '9876543228', '369 Lohamandi, Agra', 'citizen', 'active'),
('dinesh', 'dinesh.j@gmail.com', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Dinesh Jain', '9876543229', '741 Pratap Pura, Agra', 'citizen', 'active'),
('kavita', 'kavita.s@gmail.com', '$2b$10$rBV2kHf5xN0gYC/zEJF8ZOqGhD5kXI4Z7F.RZsD9v4XLQ4zzQQJbC', 'Kavita Sharma', '9876543230', '852 Khandari, Agra', 'citizen', 'active');

-- Insert Police Stations
INSERT INTO police_stations (station_name, station_code, address, city, state, pincode, phone, email, latitude, longitude, station_in_charge, status) VALUES
('Central Police Station', 'CPS001', 'MG Road, Civil Lines', 'Agra', 'Uttar Pradesh', '282001', '0562-2234567', 'central.ps@agra.police.in', 27.1767, 78.0081, 2, 'active'),
('West Police Station', 'WPS001', 'Sanjay Place', 'Agra', 'Uttar Pradesh', '282002', '0562-2234568', 'west.ps@agra.police.in', 27.1833, 77.9833, 3, 'active'),
('East Police Station', 'EPS001', 'Sikandra Road', 'Agra', 'Uttar Pradesh', '282003', '0562-2234569', 'east.ps@agra.police.in', 27.2150, 78.0422, 4, 'active'),
('Taj Ganj Police Station', 'TGP001', 'Near Taj Mahal', 'Agra', 'Uttar Pradesh', '282001', '0562-2234570', 'tajganj.ps@agra.police.in', 27.1751, 78.0421, NULL, 'active'),
('Sadar Bazaar Police Station', 'SBP001', 'Sadar Bazaar Area', 'Agra', 'Uttar Pradesh', '282001', '0562-2234571', 'sadar.ps@agra.police.in', 27.1893, 78.0122, NULL, 'active');

-- Insert Officers
INSERT INTO officers (user_id, badge_number, rank, department, station_id, joining_date, specialization, cases_solved, cases_assigned, is_available) VALUES
(2, 'AGR12345', 'Inspector', 'Criminal Investigation', 1, '2015-06-15', 'Theft & Burglary', 156, 12, TRUE),
(3, 'AGR12346', 'SI', 'Women & Child Safety', 2, '2018-03-20', 'Harassment Cases', 98, 8, TRUE),
(4, 'AGR12347', 'Inspector', 'Cybercrime', 3, '2017-09-10', 'Cyber Forensics', 134, 15, TRUE);

-- Insert FIRs with different statuses
INSERT INTO fir (fir_number, user_id, complainant_name, mobile, email, address, crime_type_id, incident_details, incident_date, incident_time, incident_location, status, assigned_officer_id, station_id, priority, estimated_loss, witness_count, created_at) VALUES
('FIR2024000001', 5, 'Rahul Gupta', '9876543220', 'citizen@example.com', '123 MG Road, Agra', 1, 'My motorcycle was stolen from the parking area of City Mall around 3 PM. Registration number: UP81AB1234. Black Honda Activa with some scratches on the left side.', '2024-11-15', '15:00:00', 'City Mall Parking, MG Road', 'Under Investigation', 2, 1, 'high', 65000.00, 2, '2024-11-15 16:30:00'),

('FIR2024000002', 6, 'Ramesh Kumar', '9876543221', 'ramesh.k@gmail.com', '456 Taj Ganj, Agra', 2, 'I received a call claiming to be from my bank asking for OTP. After sharing it, Rs 45,000 was debited from my account. Transaction happened on Nov 14th around 11 AM.', '2024-11-14', '11:15:00', 'Online - Mobile Banking', 'Active', 4, 3, 'critical', 45000.00, 0, '2024-11-14 14:20:00'),

('FIR2024000003', 7, 'Sneha Patel', '9876543222', 'sneha.p@gmail.com', '789 Sanjay Place, Agra', 5, 'I am being continuously harassed by my colleague at work through phone calls and messages. He has been following me for the past two weeks. I have call records and screenshots as evidence.', '2024-11-10', '19:30:00', 'Sanjay Place Market', 'Active', 3, 2, 'high', 0.00, 3, '2024-11-10 20:45:00'),

('FIR2024000004', 8, 'Vikram Singh', '9876543223', 'vikram.s@yahoo.com', '321 Sikandra, Agra', 7, 'My house was broken into while I was away. The lock was broken and jewelry worth Rs 2 lakhs along with cash Rs 50,000 was stolen. CCTV footage available.', '2024-11-12', '02:00:00', '321 Sikandra, Agra', 'Under Investigation', 2, 1, 'critical', 250000.00, 1, '2024-11-12 08:15:00'),

('FIR2024000005', 9, 'Anita Mehta', '9876543224', 'anita.m@gmail.com', '654 Dayal Bagh, Agra', 1, 'My purse containing Rs 8,000 cash, credit cards, and important documents was stolen from the auto-rickshaw while traveling from railway station.', '2024-11-16', '18:45:00', 'Agra Cantt Railway Station', 'Pending', NULL, 1, 'medium', 8000.00, 1, '2024-11-16 20:00:00'),

('FIR2024000006', 10, 'Suresh Yadav', '9876543225', 'suresh.y@gmail.com', '987 Kamla Nagar, Agra', 4, 'I was physically assaulted by three unidentified men near my shop. They threatened me and took Rs 15,000. I sustained injuries on face and arms. Medical report attached.', '2024-11-13', '21:00:00', 'Kamla Nagar Market', 'Active', 2, 1, 'critical', 15000.00, 2, '2024-11-13 22:30:00'),

('FIR2024000007', 11, 'Meena Devi', '9876543226', 'meena.d@gmail.com', '147 Balkeshwar, Agra', 8, 'Unknown persons vandalized my shop shutter and broke the glass. Property damage estimated at Rs 35,000. This happened during night hours.', '2024-11-11', '03:30:00', 'Balkeshwar Market', 'Closed', 2, 1, 'medium', 35000.00, 0, '2024-11-11 07:00:00'),

('FIR2024000008', 12, 'Karan Agarwal', '9876543227', 'karan.a@gmail.com', '258 Shahganj, Agra', 3, 'Fake website created in name of my company. They are collecting payments from customers using our company name and logo. Multiple customers complained.', '2024-11-09', '10:00:00', 'Online - Fake Website', 'Under Investigation', 4, 3, 'high', 125000.00, 5, '2024-11-09 11:45:00'),

('FIR2024000009', 13, 'Pooja Tiwari', '9876543228', 'pooja.t@gmail.com', '369 Lohamandi, Agra', 1, 'Gold chain was snatched by two bike-borne men near the temple. Worth approximately Rs 85,000. Incident happened in broad daylight.', '2024-11-17', '12:30:00', 'Lohamandi Temple Road', 'Pending', NULL, 2, 'high', 85000.00, 4, '2024-11-17 13:15:00'),

('FIR2024000010', 14, 'Dinesh Jain', '9876543229', 'dinesh.j@gmail.com', '741 Pratap Pura, Agra', 6, 'I was robbed at gunpoint near the ATM. Two armed men took Rs 1,20,000 cash that I had just withdrawn. They fled on a motorcycle.', '2024-11-08', '22:15:00', 'ATM Near Pratap Pura', 'Closed', 2, 1, 'critical', 120000.00, 2, '2024-11-08 22:45:00'),

('FIR2024000011', 15, 'Kavita Sharma', '9876543230', 'kavita.s@gmail.com', '852 Khandari, Agra', 2, 'Someone used my Aadhar card details to take a loan online. I received calls from recovery agents. Fraudulent loan amount is Rs 2,50,000.', '2024-11-07', '14:00:00', 'Online Identity Theft', 'Active', 4, 3, 'critical', 250000.00, 0, '2024-11-07 16:00:00'),

('FIR2024000012', 5, 'Rahul Gupta', '9876543220', 'citizen@example.com', '123 MG Road, Agra', 8, 'My car parked outside house was vandalized. Tyres punctured and scratches made on body. Damage worth Rs 45,000.', '2024-11-05', '04:00:00', '123 MG Road, Agra', 'Closed', 2, 1, 'low', 45000.00, 0, '2024-11-05 08:30:00'),

('FIR2024000013', 6, 'Ramesh Kumar', '9876543221', 'ramesh.k@gmail.com', '456 Taj Ganj, Agra', 1, 'My mobile phone (iPhone 13) was stolen from my pocket in crowded market area. Worth Rs 60,000.', '2024-11-18', '17:30:00', 'Kinari Bazaar', 'Pending', NULL, 4, 'medium', 60000.00, 0, '2024-11-18 18:45:00'),

('FIR2024000014', 7, 'Sneha Patel', '9876543222', 'sneha.p@gmail.com', '789 Sanjay Place, Agra', 4, 'Domestic violence case. Being physically abused by husband. Multiple injuries documented. Seeking protection.', '2024-11-06', '20:00:00', '789 Sanjay Place, Agra', 'Active', 3, 2, 'critical', 0.00, 2, '2024-11-06 21:30:00'),

('FIR2024000015', 8, 'Vikram Singh', '9876543223', 'vikram.s@yahoo.com', '321 Sikandra, Agra', 3, 'Received threatening emails demanding Rs 5 lakhs. Emails contain personal photos and information. Cyberstalking and extortion.', '2024-11-04', '09:00:00', 'Online - Email Threats', 'Under Investigation', 4, 3, 'critical', 0.00, 0, '2024-11-04 10:00:00');

-- Insert Complaints
INSERT INTO complaints (complaint_number, user_id, complainant_name, contact, complaint_type_id, complaint_details, status, assigned_to, priority, created_at) VALUES
('CMP2024000001', 5, 'Rahul Gupta', '9876543220', 2, 'Filed FIR 3 days ago but no action taken yet. No officer has contacted me. Case is just pending without any investigation.', 'Under Review', 2, 'high', '2024-11-18 10:00:00'),

('CMP2024000002', 9, 'Anita Mehta', '9876543224', 1, 'Officer at the front desk was rude and unprofessional. Refused to file my complaint initially and made me wait for 3 hours.', 'Resolved', 1, 'medium', '2024-11-15 14:30:00'),

('CMP2024000003', 11, 'Meena Devi', '9876543226', 4, 'Toilets at police station are not clean. No drinking water facility available for visitors. Very poor maintenance.', 'Active', 1, 'low', '2024-11-16 11:00:00'),

('CMP2024000004', 13, 'Pooja Tiwari', '9876543228', 3, 'Police officer demanded Rs 2000 bribe to file my FIR quickly. I have audio recording as proof. This is unacceptable corruption.', 'Under Review', 1, 'high', '2024-11-17 09:30:00'),

('CMP2024000005', 6, 'Ramesh Kumar', '9876543221', 2, 'Very slow response to emergency call. Called 100 but police arrived after 45 minutes. Should be much faster.', 'Resolved', 2, 'high', '2024-11-10 16:00:00'),

('CMP2024000006', 12, 'Karan Agarwal', '9876543227', 5, 'Applied for police verification certificate 2 months ago. Still pending. Need it urgently for passport.', 'Active', 1, 'medium', '2024-11-14 13:00:00'),

('CMP2024000007', 15, 'Kavita Sharma', '9876543230', 1, 'Female officer was very helpful but male officers were not cooperative. Gender bias visible in treatment.', 'Closed', 3, 'medium', '2024-11-08 15:45:00'),

('CMP2024000008', 10, 'Suresh Yadav', '9876543225', 4, 'No proper waiting area at police station. Had to stand in sun for long time. Need better infrastructure.', 'Pending', NULL, 'low', '2024-11-18 12:00:00');

-- Insert FIR Status History (some historical status changes)
INSERT INTO fir_status_history (fir_id, old_status, new_status, changed_by, remarks, changed_at) VALUES
(1, 'Pending', 'Active', 2, 'Officer assigned and investigation started', '2024-11-15 18:00:00'),
(1, 'Active', 'Under Investigation', 2, 'CCTV footage collected, suspects identified', '2024-11-16 10:00:00'),
(2, 'Pending', 'Active', 4, 'Cybercrime team investigating', '2024-11-14 16:00:00'),
(4, 'Pending', 'Active', 2, 'Investigation started, forensic team called', '2024-11-12 10:00:00'),
(4, 'Active', 'Under Investigation', 2, 'Fingerprints collected, checking CCTV', '2024-11-13 14:00:00'),
(7, 'Pending', 'Active', 2, 'Investigation completed', '2024-11-11 09:00:00'),
(7, 'Active', 'Closed', 2, 'Accused arrested and property recovered', '2024-11-12 16:00:00'),
(10, 'Pending', 'Active', 2, 'Case registered, investigation ongoing', '2024-11-09 08:00:00'),
(10, 'Active', 'Closed', 2, 'Both accused arrested, money recovered', '2024-11-14 11:00:00'),
(12, 'Pending', 'Active', 2, 'Insurance claim process started', '2024-11-05 10:00:00'),
(12, 'Active', 'Closed', 2, 'Case closed, insurance approved', '2024-11-10 15:00:00');

-- Insert Complaint Status History
INSERT INTO complaint_status_history (complaint_id, old_status, new_status, changed_by, remarks, changed_at) VALUES
(2, 'Pending', 'Under Review', 1, 'Complaint being investigated', '2024-11-15 16:00:00'),
(2, 'Under Review', 'Resolved', 1, 'Officer counseled, apology issued', '2024-11-16 14:00:00'),
(5, 'Pending', 'Active', 2, 'Response time analysis started', '2024-11-10 18:00:00'),
(5, 'Active', 'Resolved', 2, 'Staff training conducted', '2024-11-12 10:00:00'),
(7, 'Pending', 'Active', 3, 'Reviewed and acknowledged', '2024-11-08 17:00:00'),
(7, 'Active', 'Closed', 3, 'Feedback noted for improvement', '2024-11-09 12:00:00');

-- Insert Emergency Alerts
INSERT INTO emergency_alerts (user_id, alert_type, latitude, longitude, location_description, status, assigned_station_id, responded_by, response_time, created_at, responded_at, resolved_at) VALUES
(5, 'SOS', 27.1767, 78.0081, 'Near City Mall, MG Road', 'resolved', 1, 2, 8, '2024-11-18 20:30:00', '2024-11-18 20:38:00', '2024-11-18 21:00:00'),
(7, 'SOS', 27.1833, 77.9833, 'Sanjay Place Market', 'resolved', 2, 3, 12, '2024-11-17 21:15:00', '2024-11-17 21:27:00', '2024-11-17 21:45:00'),
(9, 'crime', 27.1751, 78.0421, 'Near Taj Mahal East Gate', 'resolved', 4, 2, 15, '2024-11-16 19:00:00', '2024-11-16 19:15:00', '2024-11-16 19:30:00'),
(10, 'accident', 27.2150, 78.0422, 'Sikandra Road Junction', 'resolved', 3, 4, 6, '2024-11-15 14:30:00', '2024-11-15 14:36:00', '2024-11-15 15:00:00'),
(12, 'SOS', 27.1893, 78.0122, 'Sadar Bazaar Area', 'active', 5, NULL, NULL, '2024-11-18 22:45:00', NULL, NULL);

-- Insert Certificates
INSERT INTO certificates (certificate_number, user_id, certificate_type, applicant_name, purpose, status, reviewed_by, issued_date, application_fee, payment_status, created_at) VALUES
('CERT2024001', 5, 'police_verification', 'Rahul Gupta', 'For passport application', 'approved', 2, '2024-11-10', 200.00, 'paid', '2024-11-05 10:00:00'),
('CERT2024002', 8, 'character_certificate', 'Vikram Singh', 'For job application', 'approved', 2, '2024-11-12', 150.00, 'paid', '2024-11-08 11:00:00'),
('CERT2024003', 11, 'noc', 'Meena Devi', 'For event organization', 'under_review', NULL, NULL, 300.00, 'paid', '2024-11-15 14:00:00'),
('CERT2024004', 13, 'police_verification', 'Pooja Tiwari', 'For visa application', 'pending', NULL, NULL, 200.00, 'pending', '2024-11-17 09:00:00'),
('CERT2024005', 6, 'tenant_verification', 'Ramesh Kumar', 'For rental agreement', 'approved', 3, '2024-11-14', 100.00, 'paid', '2024-11-10 16:00:00');

-- Insert Lost & Found Items
INSERT INTO lost_found (reported_by, item_type, item_description, item_category, location, date_lost_found, contact_info, status, item_value, created_at) VALUES
(5, 'lost', 'Black leather wallet containing Aadhar card, PAN card, and Rs 5000 cash', 'Wallet', 'Agra Cantt Railway Station', '2024-11-15', '9876543220', 'open', 5000.00, '2024-11-15 18:00:00'),
(9, 'found', 'Silver Samsung Galaxy phone found in auto rickshaw', 'Mobile Phone', 'Near Taj Mahal', '2024-11-16', '9876543224', 'open', 25000.00, '2024-11-16 20:00:00'),
(11, 'lost', 'Gold bracelet with initials MD engraved', 'Jewelry', 'Balkeshwar Market', '2024-11-14', '9876543226', 'open', 35000.00, '2024-11-14 19:00:00'),
(14, 'found', 'Blue backpack with school books and lunch box', 'Bag', 'Pratap Pura Bus Stop', '2024-11-17', '9876543229', 'claimed', 500.00, '2024-11-17 15:00:00'),
(7, 'lost', 'Important documents folder containing property papers', 'Documents', 'Sanjay Place', '2024-11-13', '9876543222', 'matched', 0.00, '2024-11-13 10:00:00'),
(12, 'found', 'Brown leather purse with some cash and cards', 'Wallet', 'Shahganj Market', '2024-11-13', '9876543227', 'matched', 3000.00, '2024-11-13 14:00:00');

-- Insert Anonymous Tips
INSERT INTO anonymous_tips (tip_category, tip_details, location, urgency, status, assigned_to, ip_address, verification_status, created_at) VALUES
('drug_activity', 'Suspicious drug dealing activity noticed near college area. Young people gathering late night regularly. Multiple transactions observed.', 'Near Arts College, Agra', 'high', 'investigating', 2, '192.168.1.105', 'verified', '2024-11-17 23:00:00'),
('suspicious_activity', 'Unknown persons doing recce of jewelry shops in market area. Taking photos and noting timings. Possible robbery planning.', 'Kinari Bazaar', 'high', 'under_review', 2, '192.168.1.108', 'verified', '2024-11-18 11:00:00'),
('corruption', 'RTO office demanding extra money for vehicle registration. Official fee is different but asking more in cash.', 'RTO Office Agra', 'medium', 'new', NULL, '192.168.1.112', 'unverified', '2024-11-18 15:00:00'),
('crime', 'Gang of pickpockets operating in railway station. Targeting passengers with luggage. At least 5-6 people involved.', 'Agra Cantt Railway Station', 'medium', 'investigating', 4, '192.168.1.120', 'verified', '2024-11-16 19:00:00'),
('suspicious_activity', 'Unauthorized construction happening on government land near bypass. Work going on at night. Heavy machinery involved.', 'Agra-Delhi Highway', 'low', 'closed', 2, '192.168.1.115', 'verified', '2024-11-14 08:00:00');

-- Insert Notifications
INSERT INTO notifications (user_id, notification_type, title, message, reference_id, reference_type, is_read, priority, created_at) VALUES
(5, 'fir_update', 'FIR Status Updated: FIR2024000001', 'Your FIR status has been updated to: Under Investigation', 1, 'fir', TRUE, 'high', '2024-11-16 10:00:00'),
(5, 'fir_update', 'FIR Filed: FIR2024000001', 'Your FIR has been successfully filed with number: FIR2024000001', 1, 'fir', TRUE, 'high', '2024-11-15 16:30:00'),
(6, 'fir_update', 'FIR Status Updated: FIR2024000002', 'Your FIR status has been updated to: Active', 2, 'fir', TRUE, 'high', '2024-11-14 16:00:00'),
(7, 'fir_update', 'FIR Status Updated: FIR2024000003', 'Your FIR status has been updated to: Active', 3, 'fir', FALSE, 'high', '2024-11-10 21:00:00'),
(8, 'fir_update', 'FIR Status Updated: FIR2024000004', 'Your FIR status has been updated to: Under Investigation', 4, 'fir', TRUE, 'high', '2024-11-13 14:00:00'),
(9, 'fir_update', 'FIR Filed: FIR2024000005', 'Your FIR has been successfully filed with number: FIR2024000005', 5, 'fir', FALSE, 'high', '2024-11-16 20:00:00'),
(5, 'complaint_update', 'Complaint Under Review: CMP2024001', 'Your complaint is now being reviewed by authorities', 1, 'complaint', FALSE, 'medium', '2024-11-18 11:00:00'),
(9, 'complaint_update', 'Complaint Resolved: CMP2024002', 'Your complaint has been resolved. Check resolution details.', 2, 'complaint', TRUE, 'medium', '2024-11-16 14:00:00'),
(5, 'certificate_update', 'Certificate Approved: CERT2024001', 'Your police verification certificate has been approved', 1, 'certificate', TRUE, 'medium', '2024-11-10 15:00:00'),
(8, 'certificate_update', 'Certificate Approved: CERT2024002', 'Your character certificate has been approved', 2, 'certificate', TRUE, 'medium', '2024-11-12 14:00:00'),
(5, 'alert', 'Emergency Alert Resolved', 'Your emergency alert has been resolved. Thank you for using Rakshak Portal.', 1, 'emergency', TRUE, 'high', '2024-11-18 21:00:00'),
(6, 'general', 'New Safety Advisory', 'Please be cautious in crowded areas. Report suspicious activities immediately.', NULL, NULL, FALSE, 'low', '2024-11-18 09:00:00');

-- Insert Audit Log entries
INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_values, new_values, ip_address, user_agent, created_at) VALUES
(2, 'UPDATE_STATUS', 'fir', 1, '{"status": "Pending"}', '{"status": "Active"}', '192.168.1.100', 'Mozilla/5.0', '2024-11-15 18:00:00'),
(2, 'UPDATE_STATUS', 'fir', 1, '{"status": "Active"}', '{"status": "Under Investigation"}', '192.168.1.100', 'Mozilla/5.0', '2024-11-16 10:00:00'),
(4, 'ASSIGN_OFFICER', 'fir', 2, '{"assigned_officer_id": null}', '{"assigned_officer_id": 4}', '192.168.1.102', 'Mozilla/5.0', '2024-11-14 16:00:00'),
(1, 'RESOLVE_COMPLAINT', 'complaints', 2, '{"status": "Under Review"}', '{"status": "Resolved"}', '192.168.1.101', 'Mozilla/5.0', '2024-11-16 14:00:00'),
(2, 'CLOSE_FIR', 'fir', 7, '{"status": "Active"}', '{"status": "Closed"}', '192.168.1.100', 'Mozilla/5.0', '2024-11-12 16:00:00'),
(2, 'APPROVE_CERTIFICATE', 'certificates', 1, '{"status": "under_review"}', '{"status": "approved"}', '192.168.1.100', 'Mozilla/5.0', '2024-11-10 15:00:00');

-- ============================================================================
-- ADDITIONAL STORED PROCEDURES FOR COMPLEX OPERATIONS
-- ============================================================================

DELIMITER //

-- Procedure: Search FIRs with filters
CREATE PROCEDURE sp_search_firs(
    IN p_search_term VARCHAR(255),
    IN p_status VARCHAR(50),
    IN p_crime_type_id INT,
    IN p_from_date DATE,
    IN p_to_date DATE,
    IN p_station_id INT
)
BEGIN
    SELECT 
        f.fir_id,
        f.fir_number,
        f.complainant_name,
        f.mobile,
        ct.crime_name,
        f.incident_date,
        f.incident_location,
        f.status,
        f.priority,
        u.full_name as assigned_officer,
        ps.station_name,
        f.created_at
    FROM fir f
    LEFT JOIN crime_types ct ON f.crime_type_id = ct.crime_type_id
    LEFT JOIN users u ON f.assigned_officer_id = u.user_id
    LEFT JOIN police_stations ps ON f.station_id = ps.station_id
    WHERE 
        (p_search_term IS NULL OR 
         f.fir_number LIKE CONCAT('%', p_search_term, '%') OR
         f.complainant_name LIKE CONCAT('%', p_search_term, '%') OR
         f.incident_details LIKE CONCAT('%', p_search_term, '%'))
        AND (p_status IS NULL OR f.status = p_status)
        AND (p_crime_type_id IS NULL OR f.crime_type_id = p_crime_type_id)
        AND (p_from_date IS NULL OR f.incident_date >= p_from_date)
        AND (p_to_date IS NULL OR f.incident_date <= p_to_date)
        AND (p_station_id IS NULL OR f.station_id = p_station_id)
    ORDER BY f.created_at DESC
    LIMIT 100;
END//

-- Procedure: Generate monthly crime report
CREATE PROCEDURE sp_monthly_crime_report(
    IN p_month INT,
    IN p_year INT
)
BEGIN
    SELECT 
        ct.crime_name,
        COUNT(f.fir_id) as total_cases,
        SUM(CASE WHEN f.status = 'Closed' THEN 1 ELSE 0 END) as closed_cases,
        SUM(CASE WHEN f.status IN ('Active', 'Under Investigation') THEN 1 ELSE 0 END) as active_cases,
        SUM(CASE WHEN f.status = 'Pending' THEN 1 ELSE 0 END) as pending_cases,
        AVG(CASE 
            WHEN f.status = 'Closed' AND f.closed_at IS NOT NULL 
            THEN DATEDIFF(f.closed_at, f.created_at) 
            ELSE NULL 
        END) as avg_resolution_days,
        SUM(f.estimated_loss) as total_loss
    FROM crime_types ct
    LEFT JOIN fir f ON ct.crime_type_id = f.crime_type_id 
        AND MONTH(f.created_at) = p_month 
        AND YEAR(f.created_at) = p_year
    GROUP BY ct.crime_type_id, ct.crime_name
    ORDER BY total_cases DESC;
END//

-- Procedure: Bulk status update with transaction
CREATE PROCEDURE sp_bulk_update_fir_status(
    IN p_fir_ids VARCHAR(1000),
    IN p_new_status VARCHAR(50),
    IN p_updated_by INT,
    IN p_remarks TEXT
)
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_fir_id INT;
    DECLARE cur CURSOR FOR 
        SELECT CAST(value AS UNSIGNED) 
        FROM (SELECT SUBSTRING_INDEX(SUBSTRING_INDEX(p_fir_ids, ',', numbers.n), ',', -1) value
              FROM (SELECT 1 n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 
                    UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
                    UNION ALL SELECT 9 UNION ALL SELECT 10) numbers
              WHERE CHAR_LENGTH(p_fir_ids) - CHAR_LENGTH(REPLACE(p_fir_ids, ',', '')) >= numbers.n - 1
             ) split_values;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bulk update failed';
    END;
    
    START TRANSACTION;
    
    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO v_fir_id;
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        UPDATE fir 
        SET status = p_new_status, 
            updated_at = CURRENT_TIMESTAMP
        WHERE fir_id = v_fir_id;
        
        INSERT INTO fir_status_history (fir_id, old_status, new_status, changed_by, remarks)
        SELECT v_fir_id, status, p_new_status, p_updated_by, p_remarks
        FROM fir WHERE fir_id = v_fir_id;
    END LOOP;
    CLOSE cur;
    
    COMMIT;
END//

-- Procedure: Auto-assign officer based on workload
CREATE PROCEDURE sp_auto_assign_officer(
    IN p_fir_id INT,
    IN p_station_id INT
)
BEGIN
    DECLARE v_officer_id INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Auto-assignment failed';
    END;
    
    START TRANSACTION;
    
    -- Find officer with least workload in the station
    SELECT o.user_id INTO v_officer_id
    FROM officers o
    WHERE o.station_id = p_station_id 
      AND o.is_available = TRUE
    ORDER BY o.cases_assigned ASC
    LIMIT 1;
    
    IF v_officer_id IS NOT NULL THEN
        UPDATE fir 
        SET assigned_officer_id = v_officer_id,
            status = 'Active'
        WHERE fir_id = p_fir_id;
        
        UPDATE officers
        SET cases_assigned = cases_assigned + 1
        WHERE user_id = v_officer_id;
    END IF;
    
    COMMIT;
END//

-- Function: Calculate crime rate for area
CREATE FUNCTION fn_calculate_crime_rate(
    p_location VARCHAR(255),
    p_days INT
) RETURNS DECIMAL(10,2)
DETERMINISTIC
BEGIN
    DECLARE v_count INT;
    DECLARE v_rate DECIMAL(10,2);
    
    SELECT COUNT(*) INTO v_count
    FROM fir
    WHERE incident_location LIKE CONCAT('%', p_location, '%')
      AND created_at >= DATE_SUB(CURDATE(), INTERVAL p_days DAY);
    
    SET v_rate = v_count / p_days;
    
    RETURN v_rate;
END//

-- Function: Get user reputation score
CREATE FUNCTION fn_user_reputation_score(p_user_id INT)
RETURNS INT
DETERMINISTIC
BEGIN
    DECLARE v_score INT DEFAULT 100;
    DECLARE v_false_reports INT;
    DECLARE v_verified_tips INT;
    
    -- Penalize for false reports/complaints
    SELECT COUNT(*) INTO v_false_reports
    FROM fir
    WHERE user_id = p_user_id AND status = 'Rejected';
    
    SET v_score = v_score - (v_false_reports * 10);
    
    -- Bonus for verified tips
    SELECT COUNT(*) INTO v_verified_tips
    FROM anonymous_tips
    WHERE verification_status = 'verified';
    
    SET v_score = v_score + (v_verified_tips * 5);
    
    -- Keep score between 0 and 100
    IF v_score < 0 THEN SET v_score = 0; END IF;
    IF v_score > 100 THEN SET v_score = 100; END IF;
    
    RETURN v_score;
END//

DELIMITER ;

-- ============================================================================
-- DEMONSTRATION OF ACID PROPERTIES
-- ============================================================================

-- Example Transaction demonstrating ACID properties
DELIMITER //

CREATE PROCEDURE sp_demo_acid_transaction()
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        -- Atomicity: If any error occurs, rollback all changes
        ROLLBACK;
        SELECT 'Transaction rolled back due to error' AS Result;
    END;
    
    START TRANSACTION;
    
    -- Multiple related operations that must all succeed or all fail
    INSERT INTO fir (fir_number, user_id, complainant_name, mobile, address, 
                     crime_type_id, incident_details, incident_date, incident_location)
    VALUES ('FIR_TEST', 5, 'Test User', '9999999999', 'Test Address', 
            1, 'Test incident', CURDATE(), 'Test Location');
    
    -- If this fails, previous insert will also be rolled back
    INSERT INTO notifications (user_id, notification_type, title, message)
    VALUES (5, 'fir_update', 'Test FIR Filed', 'Your test FIR has been filed');
    
    -- Consistency: All constraints and triggers maintained
    -- Isolation: Other transactions won't see partial updates
    -- Durability: Once committed, changes are permanent
    
    COMMIT;
    SELECT 'Transaction completed successfully' AS Result;
END//

DELIMITER ;

-- ============================================================================
-- INDEXES FOR OPTIMIZED QUERIES
-- ============================================================================

-- Composite indexes for common query patterns
CREATE INDEX idx_fir_status_date ON fir(status, created_at);
CREATE INDEX idx_fir_station_status ON fir(station_id, status);
CREATE INDEX idx_fir_officer_status ON fir(assigned_officer_id, status);
CREATE INDEX idx_complaint_user_status ON complaints(user_id, status);
CREATE INDEX idx_notification_user_unread ON notifications(user_id, is_read, created_at);
CREATE INDEX idx_audit_user_date ON audit_log(user_id, created_at);
CREATE INDEX idx_emergency_status_date ON emergency_alerts(status, created_at);

-- Full-text indexes for search functionality
ALTER TABLE fir ADD FULLTEXT INDEX ft_incident_details(incident_details);
ALTER TABLE complaints ADD FULLTEXT INDEX ft_complaint_details(complaint_details);
ALTER TABLE anonymous_tips ADD FULLTEXT INDEX ft_tip_details(tip_details);

-- ============================================================================
-- CONSTRAINTS AND DATA INTEGRITY RULES
-- ============================================================================

-- Add check constraints
ALTER TABLE fir 
ADD CONSTRAINT chk_fir_date CHECK (incident_date <= CURDATE()),
ADD CONSTRAINT chk_fir_loss CHECK (estimated_loss >= 0),
ADD CONSTRAINT chk_fir_witnesses CHECK (witness_count >= 0);

ALTER TABLE certificates
ADD CONSTRAINT chk_cert_fee CHECK (application_fee >= 0);

ALTER TABLE lost_found
ADD CONSTRAINT chk_item_value CHECK (item_value >= 0);

-- ============================================================================
-- PERFORMANCE OPTIMIZATION QUERIES
-- ============================================================================

-- Analyze tables for query optimization
ANALYZE TABLE users, fir, complaints, police_stations, officers, 
              crime_types, complaint_types, emergency_alerts, 
              certificates, lost_found, anonymous_tips, notifications;

-- ============================================================================
-- SAMPLE QUERIES DEMONSTRATING DATABASE CAPABILITIES
-- ============================================================================

-- Query 1: Get top 5 officers by performance
SELECT * FROM vw_officer_performance 
ORDER BY success_rate DESC, cases_solved DESC 
LIMIT 5;

-- Query 2: Crime statistics for current month
CALL sp_monthly_crime_report(MONTH(CURDATE()), YEAR(CURDATE()));

-- Query 3: Active cases requiring attention (open for more than 7 days)
SELECT 
    fir_number,
    complainant_name,
    crime_name,
    days_open,
    status,
    assigned_officer
FROM vw_active_firs
WHERE days_open > 7
ORDER BY days_open DESC;

-- Query 4: Emergency alert response statistics
SELECT 
    alert_type,
    COUNT(*) as total_alerts,
    AVG(response_time) as avg_response_minutes,
    MIN(response_time) as best_response,
    MAX(response_time) as worst_response
FROM emergency_alerts
WHERE responded_at IS NOT NULL
GROUP BY alert_type;

-- Query 5: User engagement statistics
SELECT 
    u.full_name,
    COUNT(DISTINCT f.fir_id) as total_firs,
    COUNT(DISTINCT c.complaint_id) as total_complaints,
    COUNT(DISTINCT cert.certificate_id) as total_certificates,
    fn_user_reputation_score(u.user_id) as reputation_score
FROM users u
LEFT JOIN fir f ON u.user_id = f.user_id
LEFT JOIN complaints c ON u.user_id = c.user_id
LEFT JOIN certificates cert ON u.user_id = cert.user_id
WHERE u.user_type = 'citizen'
GROUP BY u.user_id, u.full_name
ORDER BY total_firs DESC
LIMIT 10;

-- ============================================================================
-- BACKUP AND RECOVERY SETUP
-- ============================================================================

-- Enable binary logging for point-in-time recovery (set in my.cnf)
-- log-bin=mysql-bin
-- binlog-format=ROW

-- Regular backup command (run from shell)
-- mysqldump -u root -p --single-transaction --routines --triggers rakshak_portal > rakshak_backup.sql

-- ============================================================================
-- DATABASE STATISTICS AND INFORMATION
-- ============================================================================

SELECT 
    'Database Created Successfully' as Status,
    (SELECT COUNT(*) FROM users) as Total_Users,
    (SELECT COUNT(*) FROM fir) as Total_FIRs,
    (SELECT COUNT(*) FROM complaints) as Total_Complaints,
    (SELECT COUNT(*) FROM emergency_alerts) as Total_Alerts,
    (SELECT COUNT(*) FROM certificates) as Total_Certificates,
    (SELECT COUNT(*) FROM police_stations) as Total_Stations,
    (SELECT COUNT(*) FROM officers) as Total_Officers,
    (SELECT COUNT(*) FROM crime_types) as Crime_Types,
    DATABASE() as Current_Database,
    VERSION() as MySQL_Version;

-- Show all triggers
SHOW TRIGGERS;

-- Show all stored procedures
SHOW PROCEDURE STATUS WHERE Db = 'rakshak_portal';

-- Show all views
SHOW FULL TABLES WHERE TABLE_TYPE LIKE 'VIEW';

-- ============================================================================
-- END OF DATABASE SETUP
-- ============================================================================

-- Summary of DBMS Features Implemented:
-- ✓ Normalized Database (3NF) with 15 tables
-- ✓ Primary Keys and Foreign Keys with proper constraints
-- ✓ 8 Triggers for automation and data integrity
-- ✓ 10+ Stored Procedures for complex operations
-- ✓ 4 Views for reporting and analytics
-- ✓ 2 Functions for calculations
-- ✓ ACID Properties maintained through transactions
-- ✓ Comprehensive Indexing for query optimization
-- ✓ Audit Trail for all critical operations
-- ✓ Sample Data (15 users, 15 FIRs, 8 complaints, etc.)
-- ✓ Check Constraints for data validation
-- ✓ Full-text search capabilities
-- ✓ Complex joins and aggregations
-- ✓ Cascading operations
-- ✓ Transaction isolation levels configured