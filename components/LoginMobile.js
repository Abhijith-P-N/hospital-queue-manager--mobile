import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContextMobile'; 

// ✅ Accepts onGoToRegister prop for switching screens
const LoginMobile = ({ onGoToRegister }) => {
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const { login, demoLogin } = useAuth(); 

    const handleChange = (name, value) => {
        setFormData({ ...formData, [name]: value });
    };

    const handleLogin = async () => {
        setLoading(true);
        setMessage('');

        const result = await login(formData.email, formData.password);
        
        if (!result.success) {
            setMessage(result.message);
        }
        setLoading(false);
    };

    const handleDemoLogin = async (role) => {
        setLoading(true);
        setMessage('');
        const result = await demoLogin(role);

        if (!result.success) {
            setMessage(result.message);
        }
        setLoading(false);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <View style={styles.logoContainer}>
                    <Text style={styles.logoIcon}>🏥</Text>
                    <Text style={styles.logoText}>MediQueue Mobile</Text>
                    <Text style={styles.subTitle}>Sign in to book or check appointments</Text>
                </View>

                {message ? (
                    <View style={styles.messageBox}>
                        <Text style={styles.messageText}>{message}</Text>
                    </View>
                ) : null}

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="patient@demo.com"
                        keyboardType="email-address"
                        onChangeText={(text) => handleChange('email', text)}
                        value={formData.email}
                        autoCapitalize="none"
                    />
                </View>
                
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="password123"
                        secureTextEntry
                        onChangeText={(text) => handleChange('password', text)}
                        value={formData.password}
                    />
                </View>

                <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={loading}>
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.loginButtonText}>Sign In</Text>
                    )}
                </TouchableOpacity>

                

                

                {/* ✅ Functional Link to Registration */}
                <TouchableOpacity onPress={onGoToRegister}>
                    <Text style={styles.registerLink}>Don't have an account? Register Here.</Text>
                </TouchableOpacity>

            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#E0F7FA' },
    container: {
        flex: 1,
        padding: 25,
        justifyContent: 'center',
    },
    logoContainer: { marginBottom: 40, alignItems: 'center' },
    logoIcon: { fontSize: 50, color: '#00bcd4' },
    logoText: { fontSize: 28, fontWeight: 'bold', color: '#17a2b8' },
    subTitle: { fontSize: 16, color: '#6c757d', marginTop: 5 },
    formGroup: { marginBottom: 15 },
    label: { fontSize: 14, color: '#343a40', marginBottom: 5, fontWeight: '600' },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#fff',
        color: '#343a40',
        minHeight: 45
    },
    loginButton: {
        backgroundColor: '#00bcd4',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 20,
    },
    loginButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
    divider: {
        textAlign: 'center',
        marginVertical: 20,
        color: '#6c757d',
        fontSize: 14,
    },
    demoButtonsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    demoPatientButton: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        backgroundColor: '#fff',
        borderColor: '#00bcd4',
        borderWidth: 1,
        marginRight: 10,
    },
    demoDoctorButton: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        backgroundColor: '#fff',
        borderColor: '#28a745',
        borderWidth: 1,
        marginLeft: 10,
    },
    demoButtonText: { color: '#343a40', fontWeight: '600' },
    registerLink: {
        textAlign: 'center',
        color: '#007bff',
        marginTop: 15,
    },
    messageBox: { 
        backgroundColor: '#f8d7da', 
        padding: 10, 
        borderRadius: 5, 
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#f5c6cb'
    },
    messageText: { color: '#721c24', textAlign: 'center' },
});

export default LoginMobile;