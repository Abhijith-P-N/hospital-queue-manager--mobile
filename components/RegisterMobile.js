import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; 
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '../contexts/AuthContextMobile'; // Using the mobile context

// ✅ Accepts onBackToLogin prop for switching back
const RegisterMobile = ({ onBackToLogin }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        phone: '',
        age: '', 
        role: 'patient',
        specialization: '',
        department: ''
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    
    const { register } = useAuth(); 

    const handleChange = (name, value) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async () => {
        setMessage('');

        if (formData.password !== formData.confirmPassword) {
            setMessage('Passwords do not match.');
            return;
        }
        if (formData.password.length < 6) {
            setMessage('Password must be at least 6 characters.');
            return;
        }
        const ageNum = parseInt(formData.age);
        if (isNaN(ageNum) || ageNum < 0 || ageNum > 120 || formData.age === '') {
            setMessage('Please enter a valid age (0-120).');
            return;
        }

        setLoading(true);

        const { confirmPassword, ...submitData } = formData;
        
        const result = await register(submitData);
        
        if (!result.success) {
            setMessage(result.message);
        }
        setLoading(false);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Create Account</Text>
                <TouchableOpacity onPress={onBackToLogin}>
                     <Text style={styles.backButton}>Cancel</Text>
                </TouchableOpacity>
            </View>
            <ScrollView style={styles.container}>
                
                {message ? (
                    <View style={styles.messageBox}>
                        <Text style={styles.messageText}>{message}</Text>
                    </View>
                ) : null}

                {/* --- Personal Info --- */}
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Full Name</Text>
                    <TextInput style={styles.input} onChangeText={(t) => handleChange('name', t)} value={formData.name} />
                </View>
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput style={styles.input} keyboardType="email-address" onChangeText={(t) => handleChange('email', t)} value={formData.email} autoCapitalize="none" />
                </View>

                {/* --- Phone & Age Row --- */}
                <View style={styles.row}>
                    <View style={[styles.formGroup, styles.half]}>
                        <Text style={styles.label}>Phone Number</Text>
                        <TextInput style={styles.input} keyboardType="phone-pad" onChangeText={(t) => handleChange('phone', t)} value={formData.phone} />
                    </View>
                    <View style={[styles.formGroup, styles.half]}>
                        <Text style={styles.label}>Age</Text>
                        <TextInput 
                            style={styles.input} 
                            keyboardType="numeric" 
                            onChangeText={(t) => handleChange('age', t)} 
                            value={formData.age} 
                            maxLength={3}
                        />
                    </View>
                </View>

                {/* --- Role Selection --- */}
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Register As</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={formData.role}
                            onValueChange={(itemValue) => handleChange('role', itemValue)}
                            style={styles.picker}
                        >
                            <Picker.Item label="Patient" value="patient" />
                            
                        </Picker>
                    </View>
                </View>

                {/* --- Doctor Fields (Conditional) --- */}
                {formData.role === 'doctor' && (
                    <View>
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Specialization</Text>
                            <TextInput style={styles.input} onChangeText={(t) => handleChange('specialization', t)} value={formData.specialization} />
                        </View>
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Department</Text>
                            <TextInput style={styles.input} onChangeText={(t) => handleChange('department', t)} value={formData.department} />
                        </View>
                    </View>
                )}

                {/* --- Password Fields --- */}
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Password</Text>
                    <TextInput style={styles.input} secureTextEntry onChangeText={(t) => handleChange('password', t)} value={formData.password} />
                </View>
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Confirm Password</Text>
                    <TextInput style={styles.input} secureTextEntry onChangeText={(t) => handleChange('confirmPassword', t)} value={formData.confirmPassword} />
                </View>

                <TouchableOpacity style={styles.registerButton} onPress={handleSubmit} disabled={loading}>
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.registerButtonText}>Create Account</Text>
                    )}
                </TouchableOpacity>

                {/* ✅ Functional link using onBackToLogin prop */}
                <TouchableOpacity style={styles.loginLinkContainer} onPress={onBackToLogin}>
                    <Text style={styles.loginLink}>Already have an account? Sign in here.</Text>
                </TouchableOpacity>
                <View style={{ height: 50 }} />
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
    header: {
        backgroundColor: '#00bcd4',
        paddingTop: Platform.OS === 'ios' ? 0 : 30,
        paddingHorizontal: 20,
        paddingVertical: 15,
        flexDirection: 'row',
        justifyContent: 'space-between', // Ensures space for 'Cancel'
        alignItems: 'center',
        elevation: 4, 
    },
    headerTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
    },
    backButton: { // Style for the 'Cancel' button text
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    container: {
        flex: 1,
        padding: 20,
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
    formGroup: { marginBottom: 15 },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    half: { width: '48%' },
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
    pickerContainer: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        backgroundColor: '#fff',
        overflow: 'hidden',
    },
    picker: {
        height: 45,
        color: '#343a40',
    },
    registerButton: {
        backgroundColor: '#17a2b8', // Darker blue for registration action
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 15,
    },
    registerButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
    loginLinkContainer: { alignItems: 'center' },
    loginLink: { color: '#007bff', fontSize: 14, textDecorationLine: 'underline' }
});

export default RegisterMobile;