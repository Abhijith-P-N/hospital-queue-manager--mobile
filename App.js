import React, { useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'; 
import { AuthProvider, useAuth } from './contexts/AuthContextMobile'; 
import LoginMobile from './components/LoginMobile';
import PatientDashboardMobile from './PatientDashboardMobile'; 
import RegisterMobile from './components/RegisterMobile'; 

// --- Main Navigation Logic ---
const AppContent = () => {
    const { user, loading } = useAuth(); 
    const { logout } = useAuth(); 
    const [isRegistering, setIsRegistering] = useState(false); 

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#00bcd4" />
                <Text style={styles.loadingText}>Loading Session...</Text>
            </View>
        );
    }

    if (!user) {
        if (isRegistering) {
            return <RegisterMobile onBackToLogin={() => setIsRegistering(false)} />;
        }
        return <LoginMobile onGoToRegister={() => setIsRegistering(true)} />;
    }

    // 🚀 FIX APPLIED HERE: Route authenticated users based on role
    if (user.role === 'patient') {
        return <PatientDashboardMobile />;
    }

    // --- Placeholder for Doctor Dashboard or Admin ---
    return (
        <SafeAreaView style={styles.dashboardContainer}>
            <Text style={styles.dashboardTitle}>Welcome, {user.role}!</Text>
            <Text style={styles.dashboardSubTitle}>Dashboard component coming soon...</Text>
            <TouchableOpacity onPress={logout} style={styles.logoutPlaceholder}>
                <Text style={{color: '#fff', fontWeight: 'bold'}}>Logout</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
};

// --- App Root ---
export default function App() {
    return (
        <SafeAreaProvider>
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F8F9FA',
    },
    loadingText: {
        marginTop: 10,
        color: '#00bcd4',
    },
    dashboardContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F8F9FA',
    },
    dashboardTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#00bcd4',
    },
    dashboardSubTitle: {
        fontSize: 16,
        color: '#dc3545',
        marginTop: 10,
    },
    logoutPlaceholder: {
        marginTop: 20,
        backgroundColor: '#00bcd4',
        padding: 10,
        borderRadius: 8,
    }
});