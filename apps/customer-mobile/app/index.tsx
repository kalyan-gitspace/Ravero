import { Redirect } from 'expo-router';
import { useCustomerAuth } from '../components/auth/AuthProvider';

export default function IndexRoute() {
  const { status } = useCustomerAuth();
  return <Redirect href={status === 'authenticated' ? '/(tabs)' : '/(auth)'} />;
}
