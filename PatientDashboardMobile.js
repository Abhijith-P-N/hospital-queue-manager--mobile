import React, { useState, useEffect, useCallback } from 'react';
import { 
    View, Text, ScrollView, StyleSheet, 
    TouchableOpacity, Alert, Platform, 
    Modal, TextInput, ActivityIndicator,
    Dimensions,
    RefreshControl 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; 
import axios from 'axios';
import io from 'socket.io-client';
import * as Notifications from 'expo-notifications'; // Import expo-notifications
import * as Device from 'expo-device';           // Import expo-device (optional, but good practice)
import Constants from 'expo-constants';         // Import expo-constants
import { useAuth } from './contexts/AuthContextMobile'; // Assuming path

// --- Configuration ---
const BASE_URL = `https://full-hospital-management-system.onrender.com`;
const RESEND_DELAY_SECONDS = 60; // 1 minute delay

// Initializing socket connection to the hosted server
const socket = io(BASE_URL, { transports: ['websocket'] });

// --- Notification Setup ---
// Set the notification handler to allow alerts/sounds in the foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

// Utility function to request permissions and schedule local notification
async function scheduleLocalNotification(title, body) {
    // 1. Get permissions
    let token;
    if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            Alert.alert('Permission Denied', 'Failed to get push token for notification. Please enable permissions in settings.');
            return;
        }
        
        // Android specific channel setup (recommended)
        if (Platform.OS === 'android') {
             Notifications.setNotificationChannelAsync('default', {
                name: 'Default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }
    } else {
        // Skip permission check on web/emulator (non-physical device)
    }

    // 2. Schedule the notification
    await Notifications.scheduleNotificationAsync({
        content: {
            title: title,
            body: body,
            sound: 'default',
        },
        trigger: { 
            seconds: 1, // Show almost immediately
            channelId: 'default' 
        },
    });
}
// --- END Notification Setup ---

// --- Tab Configuration and Icon Mapping ---
const TABS = [
    { key: 'home', title: 'Home', icon: '🏠' },
    { key: 'livequeue', title: 'Live Queue', icon: '⏱️' }, 
    { key: 'queue', title: 'Token', icon: '🎫' },
    { key: 'prescriptions', title: 'Rx', icon: '📝' },
    { key: 'pharmacy', title: 'Pharmacy', icon: '💊' },
    { key: 'profile', title: 'Profile', icon: '👤' },
];

const TABS_NAV_BAR = TABS.filter(tab => 
    tab.key === 'home' || 
    tab.key === 'queue' || 
    tab.key === 'pharmacy' || 
    tab.key === 'profile'
);

// Helper functions 
const getTodayDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); 
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

const formatINR = (amount) => {
    if (typeof amount !== 'number' || isNaN(amount)) {
        return '₹ 0.00'; 
    }
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
    }).format(amount);
};

const ResendOTPButtonMobile = ({ lastResendTime, onResend, isLoading }) => {
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        const calculateTimeLeft = () => {
            if (lastResendTime) {
                const elapsed = (Date.now() - lastResendTime) / 1000;
                const remaining = RESEND_DELAY_SECONDS - elapsed;
                setTimeLeft(Math.max(0, Math.floor(remaining)));
            }
        };

        calculateTimeLeft();
        const interval = setInterval(calculateTimeLeft, 1000);

        return () => clearInterval(interval);
    }, [lastResendTime]);

    const displayTime = `${String(Math.floor(timeLeft)).padStart(2, '0')}`;
    const disabled = timeLeft > 0 || isLoading;

    return (
        <TouchableOpacity
            style={[styles.resendButton, disabled && styles.resendButtonDisabled]}
            onPress={onResend}
            disabled={disabled}
        >
            {isLoading ? (
                <ActivityIndicator color="#fff" />
            ) : timeLeft > 0 ? (
                <Text style={styles.resendButtonText}>Resend in {displayTime}s</Text>
            ) : (
                <Text style={styles.resendButtonText}>Resend OTP</Text>
            )}
        </TouchableOpacity>
    );
};

// 💡 NEW COMPONENT: Bottom Tab Bar
const BottomTabBar = ({ activeTab, onTabPress, pharmacyCount }) => (
    <View style={styles.bottomBarContainer}>
        {TABS_NAV_BAR.map(tab => (
            <TouchableOpacity
                key={tab.key}
                style={styles.bottomBarButton}
                onPress={() => onTabPress(tab.key)}
            >
                <Text style={[styles.bottomBarIcon, activeTab === tab.key && styles.bottomBarIconActive]}>
                    {tab.icon}
                </Text>
                <Text style={[styles.bottomBarText, activeTab === tab.key && styles.bottomBarTextActive]}>
                    {tab.title}
                    {tab.key === 'pharmacy' && pharmacyCount > 0 && 
                     <Text style={styles.bottomBarBadge}> ({pharmacyCount})</Text>}
                </Text>
            </TouchableOpacity>
        ))}
    </View>
);


const PatientDashboardMobile = () => {
    const { user, logout, API_BASE } = useAuth();
    const [doctors, setDoctors] = useState([]);
    const [selectedDoctor, setSelectedDoctor] = useState('');
    const [currentToken, setCurrentToken] = useState(null);
    const [queueStats, setQueueStats] = useState({});
    const [doctorQueue, setDoctorQueue] = useState([]); 
    const [prescriptions, setPrescriptions] = useState([]); 
    const [selectedPrescription, setSelectedPrescription] = useState(null);
    const [loading, setLoading] = useState(false);
    const [paymentLoading, setPaymentLoading] = useState(false); 
    const [activeTab, setActiveTab] = useState('home'); 
    const [bookingDate, setBookingDate] = useState(getTodayDateString());
    const [showDoctorPicker, setShowDoctorPicker] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false); 
    
    const [patientOtp, setPatientOtp] = useState(null);
    const [lastResendTime, setLastResendTime] = useState(null);


    // --- Computed values & Helpers ---
    const pharmacyOrderCount = prescriptions.filter(p => p.status === 'ready-for-payment').length;
    const isPatientToken = (token) => currentToken && token._id === currentToken._id; 
    
    const patientsAhead = doctorQueue.filter(token => 
        currentToken && 
        token.position < currentToken.position && 
        token.status === 'waiting'
    );
    
    const patientInConsultation = doctorQueue.find(token => token.status === 'in-consultation');
    
    // queueDisplayList is used specifically on the 'Token' tab to show only patients ahead/in consultation.
    const queueDisplayList = [];
    if (patientInConsultation && !isPatientToken(patientInConsultation)) {
        queueDisplayList.push(patientInConsultation);
    }
    queueDisplayList.push(...patientsAhead);
    if (currentToken && currentToken.status === 'waiting') {
        queueDisplayList.push(currentToken); 
    }

    // --- Fetching Logic ---
    const fetchDoctors = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE}/api/doctors/list`);
            setDoctors(response.data.data.doctors);
        } catch (error) {
            console.error('Error fetching doctors:', error.message);
        }
    }, [API_BASE]);

    const fetchQueueStats = useCallback(async (doctorId) => {
        if (!doctorId) {
            setQueueStats({});
            return;
        }
        try {
            const response = await axios.get(`${API_BASE}/api/queue/queue-stats/${doctorId}`);
            setQueueStats(response.data.data.stats);
        } catch (error) {
            console.error('Error fetching queue stats:', error.message);
            setQueueStats({});
        }
    }, [API_BASE]);

    const fetchDoctorQueue = useCallback(async (doctorId) => {
        if (!doctorId) {
            setDoctorQueue([]);
            return;
        }
        try {
            const response = await axios.get(`${API_BASE}/api/queue/public-queue/${doctorId}`);
            setDoctorQueue(response.data.data.queue);
        } catch (error) {
            console.error('Error fetching doctor queue:', error.message);
            setDoctorQueue([]);
        }
    }, [API_BASE]);

    const fetchCurrentToken = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE}/api/queue/my-token`);
            const token = response.data.data.token;
            setCurrentToken(token);
            return token; // Return token for use in handleQueueUpdate
        } catch (e) {
            setCurrentToken(null);
            setDoctorQueue([]); 
            return null;
        }
    }, [API_BASE, fetchQueueStats, fetchDoctorQueue]);

    const fetchPrescriptions = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE}/api/patients/prescriptions`); 
            let fetchedPrescriptions = response.data.data.prescriptions || []; 
            
            const sortedPrescriptions = fetchedPrescriptions.sort((a, b) => {
                const dateA = new Date(a.createdAt || a._id).getTime();
                const dateB = new Date(b.createdAt || b._id).getTime();
                return dateB - dateA;
            });
            
            setPrescriptions(sortedPrescriptions); 
        } catch (error) {
            console.error('Error fetching prescriptions:', error.message);
            setPrescriptions([]);
        }
    }, [API_BASE]);

    const refreshAllData = useCallback(async () => {
        setIsRefreshing(true);
        await Promise.all([
            fetchDoctors(),
            fetchCurrentToken(),
            fetchPrescriptions()
        ]);
        setIsRefreshing(false);
    }, [fetchDoctors, fetchCurrentToken, fetchPrescriptions]);

    // --- Effects and Socket Setup ---

    useEffect(() => {
        fetchDoctors();
        fetchCurrentToken();
        fetchPrescriptions();

        if (user && user.id) {
            socket.emit('join-patient', user.id);
        }
        
        const handleQueueUpdate = () => {
            const previousTokenPosition = currentToken ? currentToken.position : null;
            
            fetchCurrentToken().then((newToken) => {
                // Fetch updated queue stats for the currently selected doctor or the doctor of the new token
                const doctorIdToFetch = newToken?.doctor?._id || selectedDoctor;
                if (doctorIdToFetch) {
                    fetchQueueStats(doctorIdToFetch);
                    fetchDoctorQueue(doctorIdToFetch);
                }

                // --- NOTIFICATION LOGIC ---
                if (newToken) {
                    // Notify when token reaches position 1
                    if (newToken.status === 'waiting' && previousTokenPosition > 1 && newToken.position === 1) {
                        scheduleLocalNotification(
                            "You're Next!",
                            `Your token #${newToken.tokenNumber} is now position 1. Please prepare for your consultation!`
                        );
                    }
                    // Notify when token is called for consultation
                    else if (newToken.status === 'in-consultation' && currentToken?.status !== 'in-consultation') {
                         scheduleLocalNotification(
                            "It's Your Turn!",
                            `Your token #${newToken.tokenNumber} is now being called. Proceed to Dr. ${newToken.doctor?.name}'s office.`
                        );
                    }
                }
                // --- END NOTIFICATION LOGIC ---
            });
        };

        const handleNewPrescription = (data) => {
            if (data.token.patient._id === user.id) {
                Alert.alert('Prescription Ready!', 'Your prescription is ready! Check the Prescriptions tab.');
                fetchPrescriptions(); 
                fetchCurrentToken();
            }
        };
        
        const handleFeeReady = (data) => {
            if (data.patientId === user.id) {
                // --- FEE READY NOTIFICATION (Using Expo Notification instead of just Alert) ---
                scheduleLocalNotification(
                    'Payment Required!', 
                    `Your pharmacy fees are ready: ${formatINR(data.totalFee)}. Please pay in the Pharmacy tab to receive your medication.`
                );
                // --- END FEE READY NOTIFICATION ---
                fetchPrescriptions(); 
                setActiveTab('pharmacy'); 
            }
        };
        
        const handleDeliveryComplete = (data) => {
            if (data.patientId === user.id) {
                Alert.alert('Delivery Complete', 'Medication delivery/collection complete! Your order history has been updated.');
                fetchPrescriptions(); 
                setPatientOtp(null); 
            }
        };


        socket.on('queue-update', handleQueueUpdate);
        socket.on('new-prescription', handleNewPrescription);
        socket.on('prescription-fee-ready', handleFeeReady); 
        socket.on('prescription-delivered', handleDeliveryComplete); 


        return () => {
            socket.off('queue-update', handleQueueUpdate);
            socket.off('new-prescription', handleNewPrescription);
            socket.off('prescription-fee-ready', handleFeeReady); 
            socket.off('prescription-delivered', handleDeliveryComplete); 
        };
    }, [user, selectedDoctor, fetchDoctors, fetchCurrentToken, fetchPrescriptions, fetchQueueStats, fetchDoctorQueue, currentToken]); 
    
    useEffect(() => {
        // Data fetch synchronization for Live Queue and Booking
        if (selectedDoctor) {
            fetchQueueStats(selectedDoctor);
            fetchDoctorQueue(selectedDoctor);
        } else {
            // Clear stats immediately when no doctor is selected
            setQueueStats({});
            setDoctorQueue([]);
        }
    }, [selectedDoctor, fetchQueueStats, fetchDoctorQueue]);
    
    useEffect(() => {
        if (activeTab === 'pharmacy') {
            const activeOrders = prescriptions.filter(p => p.status !== 'completed');
            if (activeOrders.length > 0) {
                const targetOrder = activeOrders.find(p => p.status === 'ready-for-payment' || p.status === 'paid') || activeOrders[0];
                setSelectedPrescription(targetOrder);
            } else {
                setSelectedPrescription(null);
            }
        }
        if (activeTab !== 'prescriptions' && activeTab !== 'pharmacy') {
            setSelectedPrescription(null);
        }
    }, [activeTab, prescriptions]);
    
    // --- Action Handlers ---

    const getToken = async () => {
        
        if (!selectedDoctor || !bookingDate) {
            Alert.alert('Missing Info', 'Please select a doctor and date.');
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post(`${API_BASE}/api/queue/get-token`, {
                doctorId: selectedDoctor,
                bookingDate
            });
            const newToken = response.data.data.token;
            setCurrentToken(newToken);
            
            // --- BOOKING NOTIFICATION ---
            scheduleLocalNotification(
                'Success!', 
                `Token #${newToken.tokenNumber} booked for Dr. ${newToken.doctor?.name}. Your position is ${newToken.position}.`
            );
            // --- END BOOKING NOTIFICATION ---

            socket.emit('join-queue', selectedDoctor);
            fetchDoctorQueue(selectedDoctor);
            setActiveTab('queue'); // Switch to queue tab on success
        } catch (error) {
            if (error.response) {
                Alert.alert('Booking Failed (Server)', error.response.data.message || `Server Error.`);
            } else {
                Alert.alert('Booking Failed', 'An unexpected error occurred during the booking process.');
            }
        } finally {
            setLoading(false);
        }
    };
    
    const cancelToken = async () => {
        if (!currentToken || currentToken.status !== 'waiting') return;
        Alert.alert(
            "Confirm Cancellation",
            `Are you sure you want to cancel your token #${currentToken.tokenNumber}? This action cannot be undone.`,
            [
                { text: "No", style: "cancel" },
                {
                    text: "Yes, Cancel",
                    onPress: async () => {
                        setLoading(true);
                        try {
                            await axios.delete(`${API_BASE}/api/queue/cancel-token/${currentToken._id}`);

                            Alert.alert('Cancelled', `Token #${currentToken.tokenNumber} cancelled successfully.`);
                            setCurrentToken(null);
                            setDoctorQueue([]);
                            fetchQueueStats(selectedDoctor);
                        } catch (error) {
                            console.error('Token cancellation error:', error);
                            Alert.alert('Error', error.response?.data?.message || 'Error cancelling token.');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const deletePrescription = (id) => {
        Alert.alert(
            "Confirm Delete",
            "Are you sure you want to delete this prescription?",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", onPress: async () => {
                    try {
                        await axios.delete(`${API_BASE}/api/patients/prescriptions/${id}`);
                        Alert.alert('Success', 'Prescription deleted.');
                        fetchPrescriptions();
                        if (selectedPrescription?._id === id) setSelectedPrescription(null);
                    } catch (error) {
                        Alert.alert('Error', error.response?.data?.message || 'Error deleting prescription.');
                    }
                }},
            ]
        );
    };
    
    const payFees = async (prescription) => {
        setPaymentLoading(true);

        if (prescription.fee.total <= 0) {
            Alert.alert('Invalid Fee', 'Total fee is zero. Please contact pharmacy if this is an error.');
            setPaymentLoading(false);
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 1500)); 

        try {
            const generatedOtp = generateOtp();
            const response = await axios.post(`${API_BASE}/api/patients/pay-fees/${prescription._id}`, {
                mockOtp: generatedOtp 
            });

            // Using formatINR here
            Alert.alert('Payment Successful!', `Payment of ${formatINR(prescription.fee.total)} successful! Pharmacy has been notified. Your OTP is ${generatedOtp}.`);
            
            socket.emit('patient-paid', { 
                patientId: user.id, 
                tokenId: prescription._id,
                tokenNumber: prescription.tokenNumber
            });
            
            setSelectedPrescription(prev => prev ? { ...prev, status: 'paid' } : null);
            setPatientOtp(generatedOtp); 
            setLastResendTime(Date.now()); 
            fetchPrescriptions(); 
            setActiveTab('pharmacy'); 
            
        } catch (error) {
            console.error('Payment error:', error);
            Alert.alert('Payment Failed', error.response?.data?.message || 'Payment failed. Please try again.');
        } finally {
            setPaymentLoading(false);
        }
    };
    
    const resendDeliveryOtp = async () => {
        if (!selectedPrescription || selectedPrescription.status !== 'paid') return;
        
        setPaymentLoading(true);

        try {
            const generatedOtp = generateOtp();

            const response = await axios.post(`${API_BASE}/api/patients/resend-otp/${selectedPrescription._id}`, {
                mockOtp: generatedOtp 
            });

            Alert.alert('OTP Resent', `New OTP sent successfully! (Code updated for security)`);
            setPatientOtp(generatedOtp);
            setLastResendTime(Date.now()); 
        } catch (error) {
            console.error('Resend OTP error:', error);
            Alert.alert('Error', error.response?.data?.message || 'Error resending OTP. Please wait and try again.');
        } finally {
            setPaymentLoading(false);
        }
    };

    // 🌟 Renders the detailed fee breakdown with INR
    const renderFeeBreakdown = (fee) => (
        <View style={styles.feeBreakdownContainer}>
            <Text style={styles.feeBreakdownTitle}>Invoice Breakdown</Text>
            
            <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Consultation Fee:</Text>
                <Text style={styles.feeValue}>{formatINR(fee.consultation)}</Text>
            </View>
            <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Medicine Subtotal:</Text>
                <Text style={styles.feeValue}>{formatINR(fee.subtotal)}</Text>
            </View>
            <View style={[styles.feeRow, styles.feeTaxRow]}>
                <Text style={[styles.feeLabel, styles.feeTaxText]}>GST (Tax 5%):</Text>
                <Text style={[styles.feeValue, styles.feeTaxText]}>+ {formatINR(fee.tax)}</Text>
            </View>
            <View style={styles.feeSeparator} />
            <View style={styles.feeRow}>
                <Text style={styles.feeTotalLabel}>Total Payable:</Text>
                <Text style={styles.feeTotalValue}>{formatINR(fee.total)}</Text>
            </View>
            <Text style={[styles.feeStatusText, selectedPrescription.status === 'paid' ? styles.statusSuccess : styles.statusDanger]}>
                Status: {selectedPrescription?.status?.toUpperCase()}
                {fee.paidAt && ` (Paid ${new Date(fee.paidAt).toLocaleDateString()})`}
            </Text>
        </View>
    );
    
    // 🌟 RENDER FUNCTION: Profile Tab Content
    const renderProfileTabContent = () => (
        <View style={styles.card}>
            <Text style={styles.sectionTitle}>My Profile</Text>
            <View style={styles.profileInfoContainer}>
                <View style={styles.profileRow}>
                    <Text style={styles.profileLabel}>Name:</Text>
                    <Text style={styles.profileValue}>{user?.name}</Text>
                </View>
                <View style={styles.profileRow}>
                    <Text style={styles.profileLabel}>Email:</Text>
                    <Text style={styles.profileValue}>{user?.email}</Text>
                </View>
                <View style={styles.profileRow}>
                    <Text style={styles.profileLabel}>Role:</Text>
                    <Text style={styles.profileValue}>{user?.role?.charAt(0).toUpperCase() + user.role?.slice(1)}</Text>
                </View>
                <View style={styles.profileRow}>
                    <Text style={styles.profileLabel}>Patient ID (System):</Text>
                    <Text style={styles.profileValue}>{user?.id}</Text>
                </View>
                
                <View style={{ marginTop: 25 }}>
                    <TouchableOpacity 
                        style={styles.logoutButtonProfile} 
                        onPress={logout}
                    >
                        <Text style={styles.logoutButtonText}>Log Out</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );

    // --- Render Functions ---

    const renderHeader = () => (
        <View style={styles.header}>
            <Text style={styles.headerTitle}>MediQueue</Text>
        </View>
    );
    
    // 💡 UPDATED RENDER: Home Tab Content (Dynamic Book/Show Token)
    const renderHomeTabContent = () => {
        
        // Determine the text, icon, and action based on whether the user has a current token
        const isTokenActive = !!currentToken;
        const mainActionCard = isTokenActive ? 
            {
                title: "Show My Token",
                subtitle: `Token #${currentToken.tokenNumber} is active.`,
                icon: '🎟️', 
                color: '#28a745', 
                action: () => setActiveTab('queue'),
            } : 
            {
                title: "Book New Appointment",
                subtitle: "Select a doctor and get your token number now.",
                icon: '✍️', 
                color: '#00bcd4', 
                action: () => setActiveTab('queue'),
            };

        return (
            <View>
                <View style={[styles.card, styles.welcomeCard]}>
                    <Text style={styles.welcomeTitle}>Hello, {user?.name.split(' ')[0] || 'Patient'}!</Text>
                    <Text style={styles.welcomeSubtitle}>Get Quick Access to Hospital Services.</Text>
                </View>
                
                <View style={styles.actionCardContainer}>
                    {/* 1. Main Dynamic Action Card (Book or Show Token) */}
                    <TouchableOpacity 
                        style={[styles.actionCard, { 
                            backgroundColor: isTokenActive ? '#e8f5e9' : '#e0f7fa',
                            width: '48%',
                        }]} 
                        onPress={mainActionCard.action} 
                    >
                        <Text style={[styles.actionCardIcon, { color: mainActionCard.color }]}>
                            {mainActionCard.icon}
                        </Text>
                        <Text style={styles.actionCardTitle}>{mainActionCard.title}</Text>
                        <Text style={[styles.actionCardSubtitle, {color: mainActionCard.color}]}>{mainActionCard.subtitle}</Text>
                    </TouchableOpacity>

                    {/* 2. View My Prescriptions */}
                    <TouchableOpacity 
                        style={[styles.actionCard, { backgroundColor: '#fffbe0', width: '48%' }]} 
                        onPress={() => setActiveTab('prescriptions')}
                    >
                        <Text style={[styles.actionCardIcon, { color: '#ffc107' }]}>📜</Text>
                        <Text style={styles.actionCardTitle}>View Prescriptions</Text>
                        <Text style={[styles.actionCardSubtitle, {color: '#6c757d'}]}>History & Diagnosis</Text>
                    </TouchableOpacity>

                    {/* 3. Check Live Queue Status (Navigates to the new Live Queue tab) */}
                    <TouchableOpacity 
                        style={[styles.actionCard, { backgroundColor: '#f0f0f0', width: '100%', marginTop: 5 }]} 
                        onPress={() => setActiveTab('livequeue')} 
                    >
                        <Text style={[styles.actionCardIcon, { color: '#343a40' }]}>📈</Text>
                        <Text style={styles.actionCardTitle}>Check Live Queue Status</Text>
                        <Text style={[styles.actionCardSubtitle, {color: '#6c757d'}]}>See waiting times for all doctors</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.sectionTitle}>Today's Status</Text>
                <View style={styles.card}>
                    {isTokenActive ? (
                        <Text style={styles.statusTextActive}>Your token is currently active. Check the Token tab for details.</Text>
                    ) : (
                        <Text style={styles.statusTextInactive}>No active tokens found. Tap 'Book Appointment' to begin.</Text>
                    )}
                    {pharmacyOrderCount > 0 && (
                        <Text style={styles.statusTextWarning}>
                            {pharmacyOrderCount} pending fee/delivery action(s) in Pharmacy tab.
                        </Text>
                    )}
                </View>
            </View>
        );
    };

    // 💡 NEW RENDER: Live Queue Tab Content (Shows the full doctorQueue for selected doctor)
    const renderLiveQueueTabContent = () => {
        // Find the selected doctor object to display their name
        const selectedDoctorObj = selectedDoctor ? doctors.find(d => d._id === selectedDoctor) : null;
        const selectedDoctorName = selectedDoctorObj ? `Dr. ${selectedDoctorObj.name}` : 'Tap to choose doctor...';
        
        return (
            <View>
                <Text style={styles.sectionTitle}>Live Doctor Queue</Text>
                
                <Text style={styles.label}>Select Doctor to View Queue</Text>
                <TouchableOpacity style={styles.input} onPress={() => setShowDoctorPicker(true)}>
                    <Text style={{ color: selectedDoctor ? '#343a40' : '#888' }}>{selectedDoctorName}</Text>
                </TouchableOpacity>
                {renderDoctorPickerModal()}
                
                {selectedDoctor ? (
                    <View style={styles.card}>
                        <Text style={[styles.doctorNameText, {marginBottom: 10}]}>{selectedDoctorName}</Text>

                        {/* FIX: Check if we have fetched data for the selected doctor */}
                        {queueStats.totalWaiting !== undefined ? (
                            <View>
                                <View style={styles.statsBox}>
                                    <Text style={styles.statsText}>Patients in Queue:</Text>
                                    <Text style={styles.statsText}>{queueStats.totalWaiting || 0}</Text>
                                </View>
                                <View style={styles.statsBox}>
                                    <Text style={styles.statsText}>Est. Wait Time:</Text>
                                    <Text style={styles.statsText}>{queueStats.nextEstimatedWaitTime || '--'} min</Text>
                                </View>
                                
                                <Text style={styles.queueStatusTitle}>Queue Order (Full List):</Text>
                                {doctorQueue.length > 0 ? (
                                    // Using the unfiltered doctorQueue here to show everyone
                                    doctorQueue.map((token) => {
                                        const statusColor = token.status === 'in-consultation' ? '#dc3545' : '#17a2b8';
                                        
                                        return (
                                            <View key={token._id} style={styles.queueItem}>
                                                <View style={styles.queueItemLeft}>
                                                    <Text style={styles.queueItemToken}>#{token.tokenNumber}</Text>
                                                    <Text style={[styles.queueItemName, {color: statusColor, fontWeight: '600'}]}>
                                                        {token.status === 'in-consultation' ? 'IN CONSULTATION' : `Waiting`}
                                                    </Text>
                                                </View>
                                                <View style={styles.queueItemRight}>
                                                    <Text style={styles.queueItemWait}>Position: {token.position}</Text>
                                                </View>
                                            </View>
                                        );
                                    })
                                ) : (
                                    <Text style={styles.emptyQueueText}>No patients currently in this queue.</Text>
                                )}
                            </View>
                        ) : (
                            // Show loading indicator only when a doctor is selected, otherwise show prompt
                            selectedDoctor ? (
                                <View style={{alignItems: 'center'}}>
                                    <ActivityIndicator size="large" color="#00bcd4" style={{marginBottom: 10}}/>
                                    <Text style={styles.emptyListText}>Loading queue data...</Text>
                                </View>
                            ) : (
                                <Text style={styles.emptyListText}>Please select a doctor to view their live queue and waiting times.</Text>
                            )
                        )}
                    </View>
                ) : (
                    <View style={styles.card}>
                        <Text style={styles.emptyListText}>Please select a doctor to view their live queue and waiting times.</Text>
                    </View>
                )}
            </View>
        );
    };

    const renderQueueTabContent = () => { 
        if (currentToken) {
            // --- State 1: Active Token View with Your Position ---
            const statusStyle = currentToken.status === 'waiting' ? styles.statusWarning : styles.statusSuccess;
            const statusText = currentToken.status.toUpperCase();
            
            return (
                <View style={[styles.card, styles.tokenCard]}>
                    <Text style={styles.tokenCardTitle}>Your Active Token</Text>
                    
                    <View style={styles.tokenDisplayRow}>
                        <View style={styles.tokenNumberContainer}>
                            <Text style={styles.tokenNumber}>#{currentToken.tokenNumber}</Text>
                            <Text style={styles.tokenLabel}>Token No.</Text>
                        </View>
                        <View style={styles.tokenDetails}>
                            <Text style={styles.doctorNameText}>Dr. {currentToken.doctor?.name}</Text>
                            <Text style={styles.detailText}>{currentToken.doctor?.specialization}</Text>
                            <Text style={styles.detailText}>Position: {currentToken.position}</Text>
                            <Text style={styles.detailText}>Wait: {currentToken.estimatedWaitTime} min</Text>
                            <Text style={[styles.detailText, statusStyle]}>Status: {statusText}</Text>
                        </View>
                    </View>
                    
                    {currentToken.status === 'waiting' && (
                        <TouchableOpacity 
                            style={styles.cancelButton}
                            onPress={cancelToken}
                            disabled={loading}
                        >
                            <Text style={styles.cancelButtonText}>
                                {loading ? <ActivityIndicator color="#fff" /> : 'Cancel Token'}
                            </Text>
                        </TouchableOpacity>
                    )}
                    
                    {/* Active Queue List (Only showing relevant patients for better focus) */}
                    <Text style={styles.queueStatusTitle}>Patients Ahead</Text>
                    {queueDisplayList.length > 0 ? (
                        queueDisplayList.map((token) => {
                            const isCurrent = isPatientToken(token);
                            const itemStyle = isCurrent ? styles.queueItemActive : styles.queueItem;
                            
                            return (
                                <View key={token._id} style={itemStyle}>
                                    <View style={styles.queueItemLeft}>
                                        <Text style={styles.queueItemToken}>#{token.tokenNumber}</Text>
                                        <Text style={styles.queueItemName}>
                                            {token.patient?.name} {isCurrent ? '(You)' : ''}
                                        </Text>
                                    </View>
                                    <View style={styles.queueItemRight}>
                                        <Text style={styles.queueItemPosition}>Pos: {token.position}</Text>
                                        <Text style={styles.queueItemWait}>Est. Wait: {token.estimatedWaitTime} min</Text>
                                    </View>
                                </View>
                            );
                        })
                    ) : (
                        <Text style={styles.emptyQueueText}>You are next in line!</Text>
                    )}
                    
                </View>
            );
        }

        const selectedDoctorName = selectedDoctor ? doctors.find(d => d._id === selectedDoctor)?.name : 'Tap to choose doctor...';

        // --- State 2: Booking Form (No Active Token) ---
        return (
            <View style={styles.card}>
                <Text style={styles.sectionTitle}>Book New Appointment</Text>
                
                <Text style={styles.label}>Select Doctor</Text>
                <TouchableOpacity style={styles.input} onPress={() => setShowDoctorPicker(true)}>
                    <Text style={{ color: selectedDoctor ? '#343a40' : '#888' }}>Dr. {selectedDoctorName}</Text>
                </TouchableOpacity>
                {renderDoctorPickerModal()}
                
                {selectedDoctor ? (
                    <View style={styles.statsBox}>
                        <Text style={styles.statsText}>Patients Waiting: {queueStats.totalWaiting || 0}</Text>
                        <Text style={styles.statsText}>Est. Wait: {queueStats.nextEstimatedWaitTime || '--'} min</Text>
                    </View>
                ) : null}

                <Text style={styles.label}>Appointment Date</Text>
                <TextInput
                    style={styles.input}
                    value={bookingDate}
                    onChangeText={setBookingDate}
                    placeholder="YYYY-MM-DD"
                    keyboardType="numeric"
                />
                
                <TouchableOpacity 
                    style={styles.bookButton}
                    onPress={getToken}
                    disabled={loading || !selectedDoctor}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.bookButtonText}>Confirm Token Booking</Text>
                    )}
                </TouchableOpacity>
            </View>
        );
    };

    const renderPrescriptionsTabContent = () => {
        const deletePrescriptionAction = async (id) => {
            try {
                await axios.delete(`${API_BASE}/api/patients/prescriptions/${id}`);
                Alert.alert('Success', 'Prescription deleted.');
                fetchPrescriptions();
                if (selectedPrescription?._id === id) setSelectedPrescription(null);
            } catch (error) {
                Alert.alert('Error', error.response?.data?.message || 'Error deleting prescription.');
            }
        };

        const deletePrescription = (id) => {
            Alert.alert(
                "Confirm Delete",
                "Are you sure you want to delete this prescription?",
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", onPress: () => deletePrescriptionAction(id) },
                ]
            );
        };
        
        return (
            <View>
                <Text style={styles.sectionTitle}>My Prescriptions</Text>
                {prescriptions.length === 0 ? (
                    <View style={styles.card}>
                        <Text style={styles.emptyListText}>You have no recorded prescriptions yet.</Text>
                    </View>
                ) : (
                    prescriptions.map(p => (
                        <View 
                            key={p._id} 
                            style={styles.prescriptionItem}
                        >
                            <TouchableOpacity 
                                style={styles.prescriptionInfo}
                                onPress={() => {
                                    setSelectedPrescription(p);
                                }}
                            >
                                <Text style={styles.prescriptionDoctor}>Dr. {p.doctor?.name} ({p.doctor?.specialization})</Text>
                                <Text style={styles.prescriptionDiagnosis}>Diagnosis: {p.prescription.diagnosis}</Text>
                                <Text style={[styles.prescriptionStatus, p.status === 'ready-for-payment' && styles.statusDanger]}>
                                    Status: {p.status.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.deleteButton} onPress={() => deletePrescription(p._id)}>
                                <Text style={styles.deleteButtonText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    ))
                )}
                {renderPrescriptionModal()}
            </View>
        );
    };

    const renderPrescriptionModal = () => { 
        if (!selectedPrescription) return null;

        return (
            <Modal visible={!!selectedPrescription} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Prescription Details</Text>
                        <ScrollView style={{ maxHeight: Dimensions.get('window').height * 0.5 }}>
                            <Text style={styles.modalDetail}>
                                <Text style={styles.modalDetailLabel}>Doctor: </Text>
                                {selectedPrescription.doctor?.name}
                            </Text>
                            <Text style={styles.modalDetail}>
                                <Text style={styles.modalDetailLabel}>Specialization: </Text>
                                {selectedPrescription.doctor?.specialization}
                            </Text>
                            
                            <Text style={styles.modalSubtitleBold}>Diagnosis</Text>
                            <Text style={styles.modalDetail}>{selectedPrescription.prescription.diagnosis}</Text>
                            
                            <Text style={styles.modalSubtitleBold}>Medicines</Text>
                            {selectedPrescription.prescription.medicines?.map((med, index) => (
                                <Text key={index} style={styles.modalMedicine}>
                                    • {med.name} - {med.dosage} ({med.duration})
                                </Text>
                            ))}
                            <Text style={styles.modalSubtitleBold}>Notes</Text>
                            <Text style={styles.modalDetail}>{selectedPrescription.prescription.notes || 'N/A'}</Text>
                            {selectedPrescription.fee?.total !== undefined && (
                                <View style={styles.feeSummaryBox}>
                                    <Text style={styles.feeSummaryText}>Total Charged: 
                                        <Text style={styles.feeSummaryTotal}> {formatINR(selectedPrescription.fee.total)}</Text>
                                    </Text>
                                    <Text style={styles.feeSummaryStatus}>Status: {selectedPrescription.status.toUpperCase()}</Text>
                                </View>
                            )}
                        </ScrollView>
                        
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSelectedPrescription(null)}>
                            <Text style={styles.modalCloseButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        );
    };
    
    const renderPharmacyTabContent = () => {
        const activeOrders = prescriptions.filter(p => p.status !== 'completed');
        
        if (activeOrders.length === 0) {
            return (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Active Orders</Text>
                    <Text style={styles.emptyListText}>No pending orders require attention.</Text>
                </View>
            );
        }

        return (
            <View>
                <Text style={styles.sectionTitle}>Active Pharmacy Orders</Text>
                
                {/* Order List */}
                <View style={styles.card}>
                    {activeOrders.map(p => (
                        <TouchableOpacity 
                            key={p._id} 
                            style={[
                                styles.orderItem, 
                                selectedPrescription?._id === p._id && styles.orderItemActive
                            ]}
                            onPress={() => setSelectedPrescription(p)}
                        >
                            <View>
                                <Text style={styles.orderItemTitle}>Token #{p.tokenNumber} - Dr. {p.doctor.name}</Text>
                                <Text style={styles.orderItemStatus}>Status: {p.status.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</Text>
                            </View>
                            {p.fee?.total > 0 && (
                                <Text style={styles.orderItemFee}>Pay {formatINR(p.fee.total)}</Text>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>
                
                {/* Payment/OTP Details Card */}
                {selectedPrescription ? (
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Payment & Delivery Status</Text>
                        
                        {/* Render Detailed Fee Breakdown */}
                        {selectedPrescription.fee?.total !== undefined && renderFeeBreakdown(selectedPrescription.fee)}

                        {/* Status for Pending Review */}
                        {selectedPrescription.status === 'prescription-submitted' && (
                            <View style={styles.statusBoxReview}>
                                <Text style={styles.statusTextReview}>Pharmacy is reviewing prescription and calculating fees...</Text>
                            </View>
                        )}
                        
                        {/* 1. Payment Button */}
                        {selectedPrescription.status === 'ready-for-payment' && selectedPrescription.fee?.total > 0 && (
                            <TouchableOpacity 
                                style={[styles.bookButton, styles.payButton]}
                                onPress={() => payFees(selectedPrescription)} 
                                disabled={paymentLoading}
                            >
                                {paymentLoading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.bookButtonText}>Pay {formatINR(selectedPrescription.fee.total)} Now</Text>
                                )}
                            </TouchableOpacity>
                        )}
                        
                        {/* 2. OTP Display and Resend */}
                        {selectedPrescription.status === 'paid' && (
                            <View style={styles.otpBox}>
                                <Text style={styles.otpTitle}>Delivery/Collection OTP</Text>
                                <Text style={styles.otpCode}>
                                    {patientOtp || '******'}
                                </Text>
                                <Text style={styles.otpInstruction}>
                                    Show this code to the pharmacy staff.
                                </Text>
                                <ResendOTPButtonMobile 
                                    lastResendTime={lastResendTime}
                                    onResend={resendDeliveryOtp}
                                    isLoading={paymentLoading}
                                />
                            </View>
                        )}
                    </View>
                ) : (
                    <View style={styles.card}>
                        <Text style={styles.emptyListText}>Select an order to view its status and invoice.</Text>
                    </View>
                )}
            </View>
        );
    };

    const renderDoctorPickerModal = () => ( 
        <Modal visible={showDoctorPicker} animationType="slide" transparent={true}>
            <View style={styles.modalOverlay}>
                <View style={styles.doctorModalContent}>
                    <Text style={styles.modalTitle}>Select a Doctor</Text>
                    <ScrollView style={{ maxHeight: Dimensions.get('window').height * 0.6 }}>
                        {doctors.map(doctor => (
                            <TouchableOpacity
                                key={doctor._id}
                                style={styles.doctorOption}
                                onPress={() => {
                                    // FIX: Update selected doctor AND immediately trigger data fetch
                                    setSelectedDoctor(doctor._id);
                                    setShowDoctorPicker(false);
                                }}
                            >
                                <Text style={styles.doctorOptionText}>Dr. {doctor.name} - {doctor.specialization}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowDoctorPicker(false)}>
                        <Text style={styles.modalCloseButtonText}>Close</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );

    // --- Main Render ---

    const renderContent = () => {
        switch (activeTab) {
            case 'home':
                return renderHomeTabContent();
            case 'livequeue':
                return renderLiveQueueTabContent(); 
            case 'queue':
                return renderQueueTabContent();
            case 'prescriptions':
                return renderPrescriptionsTabContent();
            case 'pharmacy':
                return renderPharmacyTabContent();
            case 'profile':
                return renderProfileTabContent();
            default:
                return renderHomeTabContent();
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            {renderHeader()}
            
            <ScrollView 
                style={styles.content}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={refreshAllData}
                        tintColor="#00bcd4"
                    />
                }
            >
                {renderContent()}
                <View style={{ height: 10 }} />
            </ScrollView>
            
            {/* 💡 NEW BOTTOM NAVIGATION BAR */}
            <BottomTabBar 
                activeTab={activeTab} 
                onTabPress={setActiveTab} 
                pharmacyCount={pharmacyOrderCount}
            />
            
            {renderDoctorPickerModal()}
        </SafeAreaView>
    );
};

// --- Styles (Refactored React Native StyleSheet) ---

const styles = StyleSheet.create({
    safeArea: { 
        flex: 1, 
        backgroundColor: '#F8F9FA', 
    },
    header: {
        backgroundColor: '#00bcd4', 
        paddingHorizontal: 20,
        paddingVertical: 15,
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
        elevation: 4, 
    },
    headerTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
        padding: 15,
    },
    card: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 10,
        marginBottom: 15,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#17a2b8', 
        marginBottom: 15,
    },
    // --- New Home/Action Card Styles ---
    welcomeCard: {
        backgroundColor: '#00bcd4',
        padding: 25,
        marginBottom: 20,
        borderRadius: 12,
        shadowColor: '#00bcd4',
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    welcomeTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 5,
    },
    welcomeSubtitle: {
        fontSize: 16,
        color: '#e0f7fa',
    },
    actionCardContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
        flexWrap: 'wrap',
    },
    actionCard: {
        width: '48%', 
        minHeight: 110,
        padding: 15,
        borderRadius: 10,
        marginBottom: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#eee',
        elevation: 1,
    },
    actionCardIcon: {
        fontSize: 30,
        marginBottom: 5,
    },
    actionCardTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#343a40',
        textAlign: 'center',
    },
    actionCardSubtitle: {
        fontSize: 11,
        fontWeight: '500',
        textAlign: 'center',
        marginTop: 4,
        paddingHorizontal: 5,
    },
    statusTextActive: {
        fontSize: 14,
        fontWeight: '600',
        color: '#28a745',
    },
    statusTextInactive: {
        fontSize: 14,
        color: '#6c757d',
    },
    statusTextWarning: {
        fontSize: 14,
        color: '#ffc107',
        marginTop: 5,
    },
    // --- END Home/Action Card Styles ---
    
    // --- New Bottom Tab Bar Styles ---
    bottomBarContainer: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#ddd',
        paddingBottom: Platform.OS === 'ios' ? 10 : 0, 
        paddingTop: 5,
        elevation: 10,
    },
    bottomBarButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 5,
    },
    bottomBarIcon: {
        fontSize: 22,
        color: '#adb5bd',
        marginBottom: 2,
    },
    bottomBarIconActive: {
        color: '#00bcd4', // Active color
    },
    bottomBarText: {
        fontSize: 10,
        color: '#6c757d',
        fontWeight: '600',
    },
    bottomBarTextActive: {
        color: '#00bcd4',
    },
    bottomBarBadge: {
        color: '#dc3545', 
        fontWeight: 'bold',
    },
    // --- END Bottom Tab Bar Styles ---

    // Queue Card Styles
    tokenCard: { borderLeftWidth: 5, borderLeftColor: '#28a745', },
    tokenCardTitle: { fontSize: 20, fontWeight: 'bold', color: '#00bcd4', textAlign: 'center', marginBottom: 15, },
    tokenDisplayRow: { flexDirection: 'row', marginBottom: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 15, },
    tokenNumberContainer: { alignItems: 'center', justifyContent: 'center', marginRight: 25, paddingHorizontal: 10, },
    tokenNumber: { fontSize: 52, fontWeight: 'bold', color: '#28a745', },
    tokenLabel: { color: '#6c757d', fontSize: 12, marginTop: -5, },
    tokenDetails: { flex: 1, justifyContent: 'center', },
    doctorNameText: { fontSize: 16, fontWeight: '700', marginBottom: 3, color: '#343a40', },
    detailText: { fontSize: 14, color: '#343a40', },
    statusWarning: { color: '#ffc107', fontWeight: 'bold', marginTop: 5, },
    statusSuccess: { color: '#28a745', fontWeight: 'bold', marginTop: 5, },
    cancelButton: { backgroundColor: '#dc3545', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 15, },
    cancelButtonText: { color: '#fff', fontWeight: 'bold', },
    
    // --- QUEUE LIST STYLES (Used in both Live Queue and Token views) ---
    queueStatusTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 15, marginBottom: 10, color: '#17a2b8', },
    queueItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#eee', },
    queueItemActive: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, backgroundColor: '#f0fafa', borderLeftWidth: 4, borderLeftColor: '#00bcd4', paddingLeft: 10, },
    queueItemToken: { fontWeight: '700', color: '#6c757d', fontSize: 13, },
    queueItemName: { fontSize: 15, fontWeight: '500', },
    queueItemRight: { alignItems: 'flex-end', },
    queueItemPosition: { fontSize: 14, color: '#343a40', },
    queueItemWait: { fontSize: 12, color: '#6c757d', },
    emptyQueueText: { color: '#6c757d', textAlign: 'center', paddingVertical: 10, },
    // ------------------------------------------------------------------------
    
    // Prescription List Styles
    prescriptionItem: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff',
        padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#00bcd4', elevation: 1,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05,
    },
    prescriptionInfo: { flex: 1, marginRight: 10, },
    prescriptionDoctor: { fontSize: 15, fontWeight: '600', color: '#17a2b8', },
    prescriptionDiagnosis: { fontSize: 13, color: '#6c757d', marginTop: 3, },
    prescriptionStatus: { fontSize: 13, color: '#6c757d', marginTop: 3, fontWeight: '600' },
    statusDanger: { color: '#dc3545' },
    deleteButton: { backgroundColor: '#dc3545', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, },
    deleteButtonText: { color: '#fff', fontSize: 13, },
    emptyListText: { color: '#6c757d', textAlign: 'center', paddingVertical: 10, },

    // Modal Styles
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.6)', },
    modalContent: { width: '90%', backgroundColor: '#fff', borderRadius: 10, padding: 20, elevation: 10, },
    doctorModalContent: { width: '90%', backgroundColor: '#fff', borderRadius: 10, padding: 20, elevation: 10, },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#00bcd4', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10, },
    doctorOption: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0fafa', },
    doctorOptionText: { fontSize: 16, color: '#343a40', },
    modalCloseButton: { marginTop: 20, backgroundColor: '#6c757d', padding: 12, borderRadius: 8, alignItems: 'center', },
    modalCloseButtonText: { color: '#fff', fontWeight: 'bold', },
    modalSubtitleBold: { fontSize: 16, fontWeight: 'bold', color: '#00bcd4', marginTop: 15, marginBottom: 5, },
    modalDetail: { fontSize: 15, color: '#343a40', marginBottom: 8, flexWrap: 'wrap', },
    modalDetailLabel: { fontWeight: 'bold', color: '#343a40', },
    modalMedicine: { fontSize: 14, color: '#555', marginLeft: 10, marginBottom: 5, },
    feeSummaryBox: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginTop: 15, },
    feeSummaryText: { fontSize: 14, color: '#343a40', },
    feeSummaryTotal: { fontWeight: 'bold', color: '#28a745', fontSize: 16 },
    feeSummaryStatus: { fontSize: 12, color: '#dc3545', textAlign: 'right', marginTop: 5 },
    
    // Fee Breakdown Styles
    feeBreakdownContainer: {
        padding: 15,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ccc',
        marginBottom: 15,
        backgroundColor: '#f8f9fa',
    },
    feeBreakdownTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#00bcd4',
        marginBottom: 10,
    },
    feeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 3,
    },
    feeLabel: {
        fontSize: 14,
        color: '#343a40',
    },
    feeValue: {
        fontSize: 14,
        fontWeight: '500',
        color: '#343a40',
    },
    feeTaxRow: {
        marginTop: 5,
    },
    feeTaxText: {
        color: '#dc3545',
        fontWeight: '500',
    },
    feeSeparator: {
        height: 1,
        backgroundColor: '#eee',
        marginVertical: 8,
    },
    feeTotalLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#343a40',
    },
    feeTotalValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#28a745',
    },
    feeStatusText: {
        fontSize: 12,
        textAlign: 'right',
        marginTop: 5,
    },
    
    // Profile Section Styles 
    profileInfoContainer: {
        padding: 5,
    },
    profileRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    profileLabel: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#6c757d',
        flex: 1,
    },
    profileValue: {
        fontSize: 15,
        color: '#343a40',
        flex: 2,
        textAlign: 'right',
    },

    // 💡 STYLES FOR PHARMACY TAB
    orderItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    orderItemActive: {
        backgroundColor: '#f0fafa',
        paddingHorizontal: 10,
        marginHorizontal: -20,
        borderLeftWidth: 4,
        borderLeftColor: '#00bcd4',
    },
    orderItemTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#343a40',
    },
    orderItemStatus: {
        fontSize: 12,
        color: '#6c757d',
        marginTop: 3,
    },
    orderItemFee: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#dc3545',
    },
    payButton: {
        backgroundColor: '#28a745',
        marginTop: 20,
    },
    otpBox: {
        backgroundColor: '#e9f7ef',
        padding: 20,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 20,
        borderWidth: 1,
        borderColor: '#28a745',
    },
    otpTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#28a745',
        marginBottom: 10,
    },
    otpCode: {
        fontSize: 40,
        fontWeight: 'bold',
        color: '#28a745',
        letterSpacing: 8,
        marginBottom: 10,
    },
    otpInstruction: {
        fontSize: 13,
        color: '#343a40',
        marginBottom: 15,
        textAlign: 'center',
    },
    resendButton: {
        backgroundColor: '#ffc107',
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 20,
        marginTop: 10,
        minWidth: 150,
        alignItems: 'center',
    },
    resendButtonDisabled: {
        backgroundColor: '#adb5bd',
    },
    resendButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    logoutButtonProfile: { backgroundColor: '#dc3545', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10, },
    label: { fontSize: 14, color: '#343a40', marginBottom: 5, fontWeight: '600', },
    input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, marginBottom: 15, backgroundColor: '#f8f9fa', minHeight: 45, justifyContent: 'center', },
    statsBox: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#e0f7fa', padding: 12, borderRadius: 8, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#00bcd4', },
    
    // 🌟 ENHANCED BOOKING BUTTON STYLE
    bookButton: {
        backgroundColor: '#00bcd4',
        padding: 15,
        borderRadius: 10, // Slightly more rounded
        alignItems: 'center',
        marginTop: 20, // Increased margin for visual separation
        // Enhanced shadow for 3D effect
        ...Platform.select({
            ios: {
                shadowColor: '#00bcd4',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 5,
            },
            android: {
                elevation: 8,
            },
        }),
    },
    bookButtonText: {
        color: '#fff',
        fontWeight: '900', // Made text extra bold
        fontSize: 18,
    },
    // --- QUEUE LIST STYLES (Used in both Live Queue and Token views) ---
    queueStatusTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 15, marginBottom: 10, color: '#17a2b8', },
    queueItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#eee', },
    queueItemActive: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, backgroundColor: '#f0fafa', borderLeftWidth: 4, borderLeftColor: '#00bcd4', paddingLeft: 10, },
    queueItemToken: { fontWeight: '700', color: '#6c757d', fontSize: 13, },
    queueItemName: { fontSize: 15, fontWeight: '500', },
    queueItemRight: { alignItems: 'flex-end', },
    queueItemPosition: { fontSize: 14, color: '#343a40', },
    queueItemWait: { fontSize: 12, color: '#6c757d', },
    emptyQueueText: { color: '#6c757d', textAlign: 'center', paddingVertical: 10, },
    // ------------------------------------------------------------------------
});

export default PatientDashboardMobile;