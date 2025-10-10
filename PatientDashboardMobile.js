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
import { useAuth } from './contexts/AuthContextMobile';

// --- Configuration (Set host IP for Socket.IO connection) ---
const HOST_IP = '10.136.115.167'; 
const PORT = 5000;
const BASE_URL = `http://${HOST_IP}:${PORT}`;

const socket = io(BASE_URL, { transports: ['websocket'] });

// Helper function to get today's date in YYYY-MM-DD format
const getTodayDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); 
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
    const [activeTab, setActiveTab] = useState('queue');
    const [bookingDate, setBookingDate] = useState(getTodayDateString());
    const [showDoctorPicker, setShowDoctorPicker] = useState(false);
    
    const [isRefreshing, setIsRefreshing] = useState(false); 

    // --- Computed values (unchanged) ---
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
    
    // --- Helpers (unchanged) ---
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    };

    // --- Fetching Logic (API_BASE used) ---

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
                // If token exists, set the selected doctor and fetch its queue stats/list
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
            setPrescriptions(response.data.data.prescriptions || []); 
        } catch (error) {
            console.error('Error fetching prescriptions:', error.message);
            setPrescriptions([]);
        }
    }, [API_BASE]);

    // 🛑 Combined manual refresh function
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

        socket.on('queue-update', handleQueueUpdate);
        socket.on('new-prescription', handleNewPrescription);

        return () => {
            socket.off('queue-update', handleQueueUpdate);
            socket.off('new-prescription', handleNewPrescription);
        };
    }, [user, selectedDoctor, fetchDoctors, fetchCurrentToken, fetchPrescriptions, fetchQueueStats, fetchDoctorQueue]); 

    // 🚩 NEW EFFECT: Fetch queue stats whenever the user manually selects a doctor
    useEffect(() => {
        if (selectedDoctor && !currentToken) {
            fetchQueueStats(selectedDoctor);
        }
    }, [selectedDoctor, fetchQueueStats, currentToken]);

    // --- Actions ---
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
            console.error('Token generation error:', error);
            Alert.alert('Error', error.response?.data?.message || 'Error getting token. Please try again.');
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
    
    // --- Render Components (Mobile UI) ---

    const headerStyleDynamic = {
        ...styles.header,
        // Since Platform is available, we apply safe padding logic here
        paddingTop: Platform.OS === 'ios' ? 0 : 30, 
    };

    const renderHeader = () => (
        <View style={headerStyleDynamic}>
            <Text style={styles.headerTitle}>MediQueue</Text>
            <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>
        </View>
    );

    const renderTabs = () => (
        <View style={styles.tabContainer}>
            <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'queue' && styles.tabButtonActive]} 
                onPress={() => setActiveTab('queue')}
            >
                <Text style={[styles.tabText, activeTab === 'queue' && styles.tabTextActive]}>Queue & Booking</Text>
            </TouchableOpacity>
            <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'prescriptions' && styles.tabButtonActive]} 
                onPress={() => setActiveTab('prescriptions')}
            >
                <Text style={[styles.tabText, activeTab === 'prescriptions' && styles.tabTextActive]}>
                    Prescriptions {prescriptions.length > 0 && `(${prescriptions.length})`}
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
                                <Text style={styles.doctorOptionText}>{doctor.name} - {doctor.specialization}</Text>
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
                            <Text style={styles.detailText}>Position: **{currentToken.position}**</Text>
                            <Text style={styles.detailText}>Wait: **{currentToken.estimatedWaitTime} min**</Text>
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
                        queueDisplayList.map((token, index) => {
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

        // Booking Form View
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
                        {/* This is the key section to display pre-booking queue info */}
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
                                onPress={() => setSelectedPrescription(p)}
                            >
                                <Text style={styles.prescriptionDoctor}>Dr. {p.doctor?.name} ({p.doctor?.specialization})</Text>
                                <Text style={styles.prescriptionDiagnosis}>Diagnosis: {p.prescription.diagnosis}</Text>
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
                                    {/* • is already a good visual cue, keeping it as is */}
                                    • {med.name} - {med.dosage} ({med.duration})
                                </Text>
                            ))}
                            <Text style={styles.modalSubtitleBold}>Notes</Text>
                            <Text style={styles.modalDetail}>{selectedPrescription.prescription.notes || 'N/A'}</Text>
                        </ScrollView>
                        
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSelectedPrescription(null)}>
                            <Text style={styles.modalCloseButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
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
                {/* 🛑 Render content based on activeTab */}
                {activeTab === 'queue' ? renderQueueTabContent() : renderPrescriptionsTabContent()}
                
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
    // Header styling relies on dynamic padding outside of StyleSheet.create
    header: {
        backgroundColor: '#00bcd4', 
        paddingHorizontal: 20,
        paddingVertical: 15,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        elevation: 4, 
    },
    headerTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
    },
    logoutButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderColor: '#fff',
        borderWidth: 1,
        borderRadius: 20, 
    },
    logoutButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
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
    },
    tabTextActive: {
        color: '#00bcd4',
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
    tokenCard: {
        borderLeftWidth: 5,
        borderLeftColor: '#28a745', 
    },
    tokenCardTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#00bcd4',
        textAlign: 'center',
        marginBottom: 15,
    },
    tokenDisplayRow: {
        flexDirection: 'row',
        marginBottom: 20,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 15,
    },
    tokenNumberContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 25,
        paddingHorizontal: 10,
    },
    tokenNumber: {
        fontSize: 52,
        fontWeight: 'bold',
        color: '#28a745',
    },
    tokenLabel: {
        color: '#6c757d',
        fontSize: 12,
        marginTop: -5,
    },
    tokenDetails: {
        flex: 1,
        justifyContent: 'center',
    },
    doctorNameText: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 3,
        color: '#343a40',
    },
    detailText: {
        fontSize: 14,
        color: '#343a40',
    },
    statusWarning: {
        color: '#ffc107',
        fontWeight: 'bold',
        marginTop: 5,
    },
    statusSuccess: {
        color: '#28a745',
        fontWeight: 'bold',
        marginTop: 5,
    },
    cancelButton: {
        backgroundColor: '#dc3545',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 15,
    },
    cancelButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    queueStatusTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 15,
        marginBottom: 10,
        color: '#17a2b8',
    },
    queueItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    queueItemActive: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        backgroundColor: '#f0fafa', 
        borderLeftWidth: 4,
        borderLeftColor: '#00bcd4',
        paddingLeft: 10,
    },
    queueItemToken: {
        fontWeight: '700',
        color: '#6c757d',
        fontSize: 13,
    },
    queueItemName: {
        fontSize: 15,
        fontWeight: '500',
    },
    queueItemRight: {
        alignItems: 'flex-end',
    },
    emptyQueueText: {
        color: '#6c757d',
        textAlign: 'center',
        paddingVertical: 10,
    },
    prescriptionItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 8,
        marginBottom: 10,
        borderLeftWidth: 4,
        borderLeftColor: '#00bcd4',
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
    },
    prescriptionInfo: {
        flex: 1,
        marginRight: 10,
    },
    prescriptionDoctor: {
        fontSize: 15,
        fontWeight: '600',
        color: '#17a2b8',
    },
    prescriptionDiagnosis: {
        fontSize: 13,
        color: '#6c757d',
        marginTop: 3,
    },
    deleteButton: {
        backgroundColor: '#dc3545',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 5,
    },
    deleteButtonText: {
        color: '#fff',
        fontSize: 13,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    modalContent: {
        width: '90%',
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 20,
        elevation: 10,
    },
    doctorModalContent: {
        width: '90%',
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 20,
        elevation: 10,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#00bcd4',
        marginBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 10,
    },
    doctorOption: {
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f0fafa',
    },
    doctorOptionText: {
        fontSize: 16,
        color: '#343a40',
    },
    modalCloseButton: {
        marginTop: 20,
        backgroundColor: '#6c757d',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalCloseButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    // --- NEW/UPDATED STYLES FOR PRESCRIPTION MODAL BOLDING ---
    modalSubtitleBold: { 
        fontSize: 16,
        fontWeight: 'bold', 
        color: '#00bcd4',
        marginTop: 15,
        marginBottom: 5,
    },
    modalDetail: {
        fontSize: 15,
        color: '#343a40',
        marginBottom: 8,
        flexWrap: 'wrap', 
    },
    modalDetailLabel: { 
        fontWeight: 'bold', 
        color: '#343a40',
    },
    modalMedicine: {
        fontSize: 14,
        color: '#555',
        marginLeft: 10,
        marginBottom: 5,
    },
    // --------------------------------------------------------
});

export default PatientDashboardMobile;