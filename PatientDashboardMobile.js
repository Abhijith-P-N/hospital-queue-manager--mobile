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
import { useAuth } from './contexts/AuthContextMobile'; // Assuming path

// --- Configuration ---
const HOST_IP = '10.136.115.167'; 
const PORT = 5000;
const BASE_URL = `https://full-hospital-management-system.onrender.com`;
const RESEND_DELAY_SECONDS = 60; // 1 minute delay

const socket = io(BASE_URL, { transports: ['websocket'] });

// Helper function to get today's date in YYYY-MM-DD format
const getTodayDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); 
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper function for mock OTP generation
const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// 🌟 NEW UTILITY: Function to format numbers as Indian Rupee (INR) currency
const formatINR = (amount) => {
    if (typeof amount !== 'number' || isNaN(amount)) {
        return '₹ 0.00'; 
    }
    // Use 'en-IN' locale for Indian numbering system (lakhs/crores) and INR symbol
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
    }).format(amount);
};


// 💡 NEW COMPONENT: Resend OTP Button with Countdown (React Native version)
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
    const [activeTab, setActiveTab] = useState('queue');
    const [bookingDate, setBookingDate] = useState(getTodayDateString());
    const [showDoctorPicker, setShowDoctorPicker] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false); 
    
    const [patientOtp, setPatientOtp] = useState(null);
    const [lastResendTime, setLastResendTime] = useState(null);


    // --- Computed values & Helpers ---
    const isPatientToken = (token) => currentToken && token._id === currentToken._id; 
    
    const patientsAhead = doctorQueue.filter(token => 
        currentToken && 
        token.position < currentToken.position && 
        token.status === 'waiting'
    );
    
    const patientInConsultation = doctorQueue.find(token => token.status === 'in-consultation');
    
    const queueDisplayList = [];
    if (patientInConsultation && !isPatientToken(patientInConsultation)) {
        queueDisplayList.push(patientInConsultation);
    }
    queueDisplayList.push(...patientsAhead);
    if (currentToken && currentToken.status === 'waiting') {
        queueDisplayList.push(currentToken); 
    }
    
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    };

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
            if (token && token.doctor?._id) {
                setSelectedDoctor(token.doctor._id);
                fetchQueueStats(token.doctor._id);
                fetchDoctorQueue(token.doctor._id); 
            } else {
                setDoctorQueue([]);
            }
        } catch (e) {
            setCurrentToken(null);
            setDoctorQueue([]); 
        }
    }, [API_BASE, fetchQueueStats, fetchDoctorQueue]);

    const fetchPrescriptions = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE}/api/patients/prescriptions`); 
            let fetchedPrescriptions = response.data.data.prescriptions || []; 
            
            // Sort by descending date (Newest first: b - a)
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
            fetchCurrentToken();
            if (selectedDoctor) {
                fetchQueueStats(selectedDoctor);
                fetchDoctorQueue(selectedDoctor);
            }
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
                Alert.alert('Payment Required!', `Your prescription fees are ready: ${formatINR(data.totalFee)}. Pay now in the Pharmacy Status tab.`);
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
    }, [user, selectedDoctor, fetchDoctors, fetchCurrentToken, fetchPrescriptions, fetchQueueStats, fetchDoctorQueue]); 
    
    useEffect(() => {
        if (selectedDoctor && !currentToken) {
            fetchQueueStats(selectedDoctor);
        }
    }, [selectedDoctor, fetchQueueStats, currentToken]);
    
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
            Alert.alert('Success', `Token #${newToken.tokenNumber} generated successfully!`);
            socket.emit('join-queue', selectedDoctor);
            fetchDoctorQueue(selectedDoctor);
        } catch (error) {
            if (error.response) {
                console.error('TOKEN ERROR - Response Status:', error.response.status);
                console.error('TOKEN ERROR - Response Data:', error.response.data);
                Alert.alert(
                    'Booking Failed (Server)', 
                    error.response.data.message || `Server Error: Status ${error.response.status}. Please check inputs.`
                );
            } else if (error.request) {
                console.error('TOKEN ERROR - Network Error:', error.message);
                Alert.alert(
                    'Booking Failed (Network)', 
                    `Could not reach the server at ${BASE_URL}. Please check your connection and firewall.`
                );
            } else {
                console.error('TOKEN ERROR - Request Setup:', error.message);
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
    
    // 🌟 NEW RENDER FUNCTION: Profile Tab Content (Now includes Logout)
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


    // --- Render Components (Mobile UI) ---

    const headerStyleDynamic = {
        ...styles.header,
        paddingTop: Platform.OS === 'ios' ? 0 : 30, 
    };

    const renderHeader = () => (
        <View style={headerStyleDynamic}>
            <Text style={styles.headerTitle}>MediQueue</Text>
            {/* LOGOUT BUTTON REMOVED FROM HERE */}
        </View>
    );

    const renderTabs = () => (
        <View style={styles.tabContainer}>
            <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'queue' && styles.tabButtonActive]} 
                onPress={() => setActiveTab('queue')}
            >
                <Text style={[styles.tabText, activeTab === 'queue' && styles.tabTextActive]}>Queue</Text>
            </TouchableOpacity>
            <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'prescriptions' && styles.tabButtonActive]} 
                onPress={() => setActiveTab('prescriptions')}
            >
                <Text style={[styles.tabText, activeTab === 'prescriptions' && styles.tabTextActive]}>
                    Prescriptions
                </Text>
            </TouchableOpacity>
            <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'pharmacy' && styles.tabButtonActive]} 
                onPress={() => setActiveTab('pharmacy')}
            >
                <Text style={[styles.tabText, activeTab === 'pharmacy' && styles.tabTextActive]}>
                    Pharmacy {prescriptions.filter(p => p.status === 'ready-for-payment').length > 0 && 
                        <Text style={styles.tabBadge}>({prescriptions.filter(p => p.status === 'ready-for-payment').length})</Text>}
                </Text>
            </TouchableOpacity>
             {/* 🌟 PROFILE TAB */}
            <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'profile' && styles.tabButtonActive]} 
                onPress={() => setActiveTab('profile')}
            >
                <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>
                    Profile
                </Text>
            </TouchableOpacity>
        </View>
    );

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
    
    const renderQueueTabContent = () => { 
        if (currentToken) {
            const statusStyle = currentToken.status === 'waiting' ? styles.statusWarning : styles.statusSuccess;
            const statusText = currentToken.status.toUpperCase();
            
            return (
                <View style={[styles.card, styles.tokenCard]}>
                    <Text style={styles.tokenCardTitle}>Your Active Token</Text>
                    
                    <View style={styles.tokenDisplayRow}>
                        <View style={styles.tokenNumberContainer}>
                            <Text style={styles.tokenNumber}>{currentToken.tokenNumber}</Text>
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

                    <Text style={styles.queueStatusTitle}>Active Queue</Text>
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
                        <Text style={styles.emptyQueueText}>No other patients currently waiting.</Text>
                    )}
                </View>
            );
        }

        const selectedDoctorName = selectedDoctor ? doctors.find(d => d._id === selectedDoctor)?.name : 'Tap to choose doctor...';

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
                        <Text style={styles.bookButtonText}>Book Appointment</Text>
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

    return (
        <SafeAreaView style={styles.safeArea}>
            {renderHeader()}
            {renderTabs()}
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
                {activeTab === 'queue' && renderQueueTabContent()}
                {activeTab === 'prescriptions' && renderPrescriptionsTabContent()}
                {activeTab === 'pharmacy' && renderPharmacyTabContent()}
                {/* 🌟 RENDER PROFILE TAB */}
                {activeTab === 'profile' && renderProfileTabContent()}
                
                <View style={{ height: 50 }} />
            </ScrollView>
        </SafeAreaView>
    );
};

// --- Styles (React Native StyleSheet) ---

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
        justifyContent: 'flex-start', // Adjusted to account for removed logout button
        alignItems: 'center',
        elevation: 4, 
    },
    headerTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
    },
    // The original logoutButton style is now unused in the header
    // Retaining for use by the ResendOTPButton and for the new profile button style source
    logoutButton: {
        // paddingHorizontal: 12, // Removed from header
        // paddingVertical: 6,    // Removed from header
        // borderColor: '#fff',   // Removed from header
        // borderWidth: 1,        // Removed from header
        // borderRadius: 20,      // Removed from header
    },
    logoutButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    // 🌟 NEW STYLE FOR PROFILE LOGOUT BUTTON
    logoutButtonProfile: {
        backgroundColor: '#dc3545', // Danger color
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
        elevation: 1,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 15,
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
        alignItems: 'center',
    },
    tabButtonActive: {
        borderBottomColor: '#00bcd4', 
    },
    tabText: {
        color: '#6c757d',
        fontWeight: '600',
        fontSize: 14,
        textAlign: 'center', // Added for better wrap handling
    },
    tabTextActive: {
        color: '#00bcd4',
    },
    tabBadge: {
        color: 'red',
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
    label: {
        fontSize: 14,
        color: '#343a40',
        marginBottom: 5,
        fontWeight: '600',
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        padding: 12,
        borderRadius: 8,
        marginBottom: 15,
        backgroundColor: '#f8f9fa',
        minHeight: 45,
        justifyContent: 'center',
    },
    statsBox: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#e0f7fa', 
        padding: 12,
        borderRadius: 8,
        marginBottom: 15,
        borderLeftWidth: 4,
        borderLeftColor: '#00bcd4',
    },
    statusBoxReview: {
        backgroundColor: '#fffae0',
        padding: 15,
        borderRadius: 8,
        marginTop: 15,
        borderLeftWidth: 4,
        borderLeftColor: '#ffc107',
        alignItems: 'center',
    },
    statusTextReview: {
        color: '#665c00',
        fontWeight: '600',
        fontSize: 15,
        textAlign: 'center',
    },
    statsText: {
        color: '#17a2b8',
        fontWeight: '700',
        fontSize: 14,
    },
    bookButton: {
        backgroundColor: '#00bcd4',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10,
    },
    bookButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    // Queue Card Styles (Existing)
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
    queueStatusTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 15, marginBottom: 10, color: '#17a2b8', },
    queueItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#eee', },
    queueItemActive: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, backgroundColor: '#f0fafa', borderLeftWidth: 4, borderLeftColor: '#00bcd4', paddingLeft: 10, },
    queueItemToken: { fontWeight: '700', color: '#6c757d', fontSize: 13, },
    queueItemName: { fontSize: 15, fontWeight: '500', },
    queueItemRight: { alignItems: 'flex-end', },
    queueItemPosition: { fontSize: 14, color: '#343a40', },
    queueItemWait: { fontSize: 12, color: '#6c757d', },
    emptyQueueText: { color: '#6c757d', textAlign: 'center', paddingVertical: 10, },
    
    // Prescription List Styles (Existing/Minor Update)
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

    // Modal Styles (Existing/Minor Update)
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
    // End Profile Section Styles

    // 💡 EXISTING STYLES FOR PHARMACY TAB
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
});

export default PatientDashboardMobile;