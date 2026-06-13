import React from 'react';
import { Image, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';
import ErrorBoundary from '../components/common/ErrorBoundary';
import LocationGuardProvider from '../components/common/LocationGuardProvider';

// Wraps each screen in its own ErrorBoundary so a crash in one screen
// shows "Something went wrong" + "Try Again" on that screen only —
// the rest of the app stays alive. Critical for monkey-testing stability.
function withErrorBoundary<T extends React.ComponentType<any>>(Component: T): T {
  const Wrapped = (props: any) => (
    <ErrorBoundary>
      <Component {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `WithEB(${Component.displayName || Component.name})`;
  return Wrapped as unknown as T;
}

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import JourneyPlanScreen from '../screens/JourneyPlanScreen';
import OrderHistoryScreen from '../screens/OrderHistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import LocalDataScreen from '../screens/LocalDataScreen';
import CustomerVisitScreen from '../screens/CustomerVisitScreen';
import OrderScreen from '../screens/OrderScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import StoreCheckScreen from '../screens/StoreCheckScreen';
import PlanogramScreen from '../screens/PlanogramScreen';
import PlanogramHistoryScreen from '../screens/PlanogramHistoryScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import SkipReasonScreen from '../screens/SkipReasonScreen';
import EndOfDayScreen from '../screens/EndOfDayScreen';
import RotaScreen from '../screens/RotaScreen';
import RotaCreateScreen from '../screens/RotaCreateScreen';
import ExpiryCheckScreen from '../screens/ExpiryCheckScreen';
import CompetitorScreen from '../screens/CompetitorScreen';
import OpeningStockScreen from '../screens/OpeningStockScreen';
import PhysicalStockScreen from '../screens/PhysicalStockScreen';
import OSOIScreen from '../screens/OSOIScreen';
import POCaptureScreen from '../screens/POCaptureScreen';
import MTDSummaryScreen from '../screens/MTDSummaryScreen';
import MyTeamScreen from '../screens/MyTeamScreen';
import TeamMemberDetailScreen from '../screens/TeamMemberDetailScreen';
import LocationApprovalScreen from '../screens/LocationApprovalScreen';
import StartDayScreen from '../screens/StartDayScreen';
import CustomerDashboardScreen from '../screens/CustomerDashboardScreen';
import InitiativeListScreen from '../screens/InitiativeListScreen';
import InitiativeDetailScreen from '../screens/InitiativeDetailScreen';
import InitiativeExecutionScreen from '../screens/InitiativeExecutionScreen';
import BroadcastInitiativeScreen from '../screens/BroadcastInitiativeScreen';
import TestCasesScreen from '../screens/TestCasesScreen';
import ProductSamplingScreen from '../screens/ProductSamplingScreen';
import PermanentDisplayScreen from '../screens/PermanentDisplayScreen';
import PermanentDisplayCheckScreen from '../screens/PermanentDisplayCheckScreen';
import SurveyListScreen from '../screens/SurveyListScreen';
import SurveyExecuteScreen from '../screens/SurveyExecuteScreen';
import NearExpiryReportScreen from '../screens/NearExpiryReportScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import SalesReportScreen from '../screens/SalesReportScreen';
import TargetVsAchievementScreen from '../screens/TargetVsAchievementScreen';
import MessagesScreen from '../screens/MessagesScreen';
import EndorsementScreen from '../screens/EndorsementScreen';
import LeaveScreen from '../screens/LeaveScreen';
import AboutScreen from '../screens/AboutScreen';
import ProspectScreen from '../screens/ProspectScreen';
import EditCustomerScreen from '../screens/EditCustomerScreen';
import BrandTrainingScreen from '../screens/BrandTrainingScreen';
import CustomerInteractionScreen from '../screens/CustomerInteractionScreen';
import ProductFeedbackScreen from '../screens/ProductFeedbackScreen';
import SalesInvoiceScreen from '../screens/SalesInvoiceScreen';
import InvoiceDetailScreen from '../screens/InvoiceDetailScreen';
import CollectionScreen from '../screens/CollectionScreen';
import VanStockScreen from '../screens/VanStockScreen';
import ReturnOrderScreen from '../screens/ReturnOrderScreen';
import ShareOfShelfScreen from '../screens/ShareOfShelfScreen';
import PriceCheckScreen from '../screens/PriceCheckScreen';
import ApprovalScreen from '../screens/ApprovalScreen';
import EscalationMatrixScreen from '../screens/EscalationMatrixScreen';
import MobileReportsScreen from '../screens/MobileReportsScreen';
import DailyStockSaleReportScreen from '../screens/DailyStockSaleReportScreen';
import StoreUserVisitReportScreen from '../screens/StoreUserVisitReportScreen';
import UserJourneyAttendanceScreen from '../screens/UserJourneyAttendanceScreen';
import UserWiseAttendanceScreen from '../screens/UserWiseAttendanceScreen';
import TaskDoneStatusReportScreen from '../screens/TaskDoneStatusReportScreen';
import InitialSyncScreen from '../screens/InitialSyncScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const needsSync = useAuthStore((s) => s.needsSync);

  return (
    <LocationGuardProvider>
    <Stack.Navigator
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: '#FFFFFF' },
        headerShadowVisible: false,
        headerTintColor: '#1a3a8f',
        headerTitleAlign: 'center',
        contentStyle: { backgroundColor: '#F5F7FA' },
        headerTitle: () => (
          <Image source={require('../assets/farmley_logo.png')} style={{ width: 140, height: 42 }} resizeMode="contain" />
        ),
        headerRight: () => <View style={{ width: 32 }} />,
      }}
    >
      {!isLoggedIn ? (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      ) : needsSync ? (
        <Stack.Screen
          name="InitialSync"
          component={InitialSyncScreen}
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="MainTabs"
            component={withErrorBoundary(DashboardScreen)}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Stores"
            component={withErrorBoundary(JourneyPlanScreen)}
            options={{ headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="Orders"
            component={OrderHistoryScreen}
            options={{ title: 'Order History' }}
          />
          <Stack.Screen
            name="CustomerVisit"
            component={withErrorBoundary(CustomerVisitScreen)}
            options={{ title: 'Store Visit' }}
          />
          <Stack.Screen
            name="Order"
            component={OrderScreen}
            options={{ title: 'New Order' }}
          />
          <Stack.Screen
            name="OrderDetail"
            component={OrderDetailScreen}
            options={{ title: 'Order Detail' }}
          />
          <Stack.Screen
            name="StoreCheck"
            component={StoreCheckScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PlanogramHistory"
            component={PlanogramHistoryScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Planogram"
            component={PlanogramScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Attendance"
            component={AttendanceScreen}
            options={{ title: 'Start Day' }}
          />
          <Stack.Screen
            name="SkipReason"
            component={SkipReasonScreen}
            options={{ title: 'Skip Visit' }}
          />
          <Stack.Screen
            name="EndOfDay"
            component={EndOfDayScreen}
            options={{ title: 'End of Day' }}
          />
          <Stack.Screen
            name="Rota"
            component={RotaScreen}
            options={{ title: 'Rota' }}
          />
          <Stack.Screen
            name="RotaCreate"
            component={RotaCreateScreen}
            options={{ title: 'Create Schedule' }}
          />
          <Stack.Screen
            name="ExpiryCheck"
            component={ExpiryCheckScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Competitor"
            component={CompetitorScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="OpeningStock"
            component={OpeningStockScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PhysicalStock"
            component={PhysicalStockScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="OSOI"
            component={OSOIScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="POCapture"
            component={POCaptureScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="MTDSummary"
            component={MTDSummaryScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="MyTeam"
            component={MyTeamScreen}
            options={{ title: 'My Team' }}
          />
          <Stack.Screen
            name="TeamMemberDetail"
            component={TeamMemberDetailScreen}
            options={({ route }: any) => ({ title: route.params?.name ?? 'Team Member' })}
          />
          <Stack.Screen
            name="LocationApproval"
            component={LocationApprovalScreen}
            options={{ title: 'Location Approvals' }}
          />
          <Stack.Screen name="StartDay" component={StartDayScreen} options={{ title: 'Start Day' }} />
          <Stack.Screen name="CustomerDashboard" component={withErrorBoundary(CustomerDashboardScreen)} options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="InitiativeList" component={InitiativeListScreen} options={{ title: 'Initiatives' }} />
          <Stack.Screen name="InitiativeDetail" component={InitiativeDetailScreen} options={({ route }: any) => ({ title: route.params?.title ?? 'Initiative' })} />
          <Stack.Screen name="InitiativeExecution" component={InitiativeExecutionScreen} options={{ title: 'Execute Initiative' }} />
          {/* BroadcastInitiative renders its own header — disable RN's so we
              don't show two stacked back buttons. */}
          <Stack.Screen name="BroadcastInitiative" component={BroadcastInitiativeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="TestCases" component={TestCasesScreen} options={{ title: 'Test Cases', headerShown: false }} />
          {/* ProductSampling has no custom header — turn the RN header back on
              so users get a back button. */}
          <Stack.Screen name="ProductSampling" component={ProductSamplingScreen} options={{ headerShown: false }} />
          <Stack.Screen name="PermanentDisplay" component={PermanentDisplayScreen} options={{ title: 'Permanent Displays' }} />
          <Stack.Screen name="PermanentDisplayCheck" component={PermanentDisplayCheckScreen} options={{ title: 'Display Audit' }} />
          <Stack.Screen name="SurveyList" component={SurveyListScreen} options={{ title: 'Surveys' }} />
          <Stack.Screen name="SurveyExecute" component={SurveyExecuteScreen} options={({ route }: any) => ({ title: route.params?.title ?? 'Survey' })} />
          <Stack.Screen name="NearExpiryReport" component={NearExpiryReportScreen} options={{ title: 'Near-Expiry Report' }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'My Profile' }} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Change Password' }} />
          <Stack.Screen name="SalesReport" component={SalesReportScreen} options={{ headerShown: false }} />
          <Stack.Screen name="TargetVsAchievement" component={TargetVsAchievementScreen} options={{ title: 'Target vs Achievement' }} />
          <Stack.Screen name="Messages" component={MessagesScreen} options={{ title: 'Messages' }} />
          <Stack.Screen name="Endorsement" component={EndorsementScreen} options={{ title: 'Endorsement' }} />
          <Stack.Screen name="Leave" component={LeaveScreen} options={{ title: 'Leave Management' }} />
          <Stack.Screen name="About" component={AboutScreen} options={{ title: 'About' }} />
          <Stack.Screen name="Prospect" component={ProspectScreen} options={{ title: 'Prospects' }} />
          <Stack.Screen name="EditCustomer" component={EditCustomerScreen} options={{ title: 'Edit Prospect' }} />
          <Stack.Screen name="BrandTraining" component={BrandTrainingScreen} options={{ title: 'Brand Training' }} />
          <Stack.Screen name="CustomerInteraction" component={CustomerInteractionScreen} options={{ title: 'Customer Interaction' }} />
          <Stack.Screen name="ProductFeedback" component={ProductFeedbackScreen} options={{ headerShown: false }} />
          <Stack.Screen name="EscalationMatrix" component={EscalationMatrixScreen} options={{ title: 'Escalation Matrix' }} />
          <Stack.Screen name="MobileReports" component={MobileReportsScreen} options={{ title: 'Mobile Reports' }} />
          <Stack.Screen name="DailyStockSaleReport" component={DailyStockSaleReportScreen} options={{ title: 'Daily Stock & Sale Report' }} />
          <Stack.Screen name="StoreUserVisitReport" component={StoreUserVisitReportScreen} options={{ title: 'Store User Visit Report' }} />
          <Stack.Screen name="UserJourneyAttendance" component={UserJourneyAttendanceScreen} options={{ title: 'User Journey Attendance' }} />
          <Stack.Screen name="UserWiseAttendance" component={UserWiseAttendanceScreen} options={{ title: 'User Wise Attendance' }} />
          <Stack.Screen name="TaskDoneStatusReport" component={TaskDoneStatusReportScreen} options={{ title: 'Task Done Status Report' }} />
          <Stack.Screen name="SalesInvoice" component={SalesInvoiceScreen} options={{ title: 'Sales Invoices' }} />
          <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title: 'Invoice' }} />
          <Stack.Screen name="Collection" component={CollectionScreen} options={{ title: 'Collections' }} />
          <Stack.Screen name="VanStock" component={VanStockScreen} options={{ title: 'Van Stock' }} />
          <Stack.Screen name="ReturnOrder" component={ReturnOrderScreen} options={{ title: 'Return Order' }} />
          <Stack.Screen name="ShareOfShelf" component={ShareOfShelfScreen} options={{ title: 'Share of Shelf' }} />
          <Stack.Screen name="PriceCheck" component={PriceCheckScreen} options={{ title: 'Price Check' }} />
          <Stack.Screen name="Approval" component={ApprovalScreen} options={{ title: 'Approvals' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
          <Stack.Screen name="LocalData" component={LocalDataScreen} options={{ headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
    </LocationGuardProvider>
  );
}
