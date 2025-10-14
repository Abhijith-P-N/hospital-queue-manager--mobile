import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native'; 

// 🚀 CONFIGURATION: HOST IP ADDRESS (UNIFIED) 🚀
const HOST_IP = '10.136.115.167'; 
const PORT = 5000;
const API_BASE = `https://full-hospital-management-system.onrender.com`; 

const AuthContext = createContext();

const AUTH_TOKEN_KEY = 'userToken';
const USER_DATA_KEY = 'userData';

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const setAuthSession = async (token, userData) => {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
        await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
        setUser(userData);
    };

    useEffect(() => {
        const loadUser = async () => {
            const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
            const storedUser = await AsyncStorage.getItem(USER_DATA_KEY);

            if (storedToken && storedUser) {
                const userData = JSON.parse(storedUser);
                setAuthSession(storedToken, userData);
            }
            setLoading(false);
        };
        loadUser();
    }, []);

    const login = async (email, password) => {
        try {
            const response = await axios.post(`${API_BASE}/api/auth/login`, { email, password });
            const { token, user: userData } = response.data.data;
            
            if (!token || !userData) {
                 return { success: false, message: "Server login successful but returned invalid data." };
            }

            await setAuthSession(token, userData);
            return { success: true, data: userData };
        } catch (error) {
            console.error('Login Error:', error.response?.data || error.message);
            const message = error.response?.data?.message || `Login failed. Server at ${API_BASE} unreachable.`;
            return { success: false, message };
        }
    };
    
    // ⬇️ FIX APPLIED: Ensuring explicit return in all execution paths ⬇️
    const register = async (formData) => {
        try {
            const response = await axios.post(`${API_BASE}/api/auth/register`, formData);
            const { token, user: userData } = response.data.data;
            
            if (!token || !userData) {
                 return { success: false, message: "Registration successful but returned invalid data." };
            }

            await setAuthSession(token, userData);
            // ✅ SUCCESS PATH RETURN
            return { success: true, data: userData }; 
        } catch (error) {
            console.error('Registration Error:', error.response?.data || error.message);
            const message = error.response?.data?.message || 'Registration failed. Check server status.';
            
            // ✅ ERROR PATH RETURN
            return { success: false, message }; 
        }
    };
    // ⬆️ FIX APPLIED ⬆️

    const logout = async () => {
        try {
            await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
            await AsyncStorage.removeItem(USER_DATA_KEY);
            delete axios.defaults.headers.common['Authorization'];
            setUser(null);
        } catch (error) {
            console.error("Logout error", error);
            Alert.alert("Logout Error", "Could not clear local session.");
        }
    };

    const demoLogin = async (role) => {
        const email = role === 'patient' ? 'patient@demo.com' : 'doctor@demo.com';
        const password = 'password123';
        return await login(email, password);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, register, demoLogin, API_BASE }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);