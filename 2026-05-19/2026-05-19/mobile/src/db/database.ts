import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { migrations } from './migrations';
import Customer from './models/Customer';
import Item from './models/Item';
import Price from './models/Price';
import JourneyPlanCustomer from './models/JourneyPlanCustomer';
import Order from './models/Order';
import OrderLine from './models/OrderLine';
import StoreCheck from './models/StoreCheck';
import StoreCheckItem from './models/StoreCheckItem';
import PlanogramExecution from './models/PlanogramExecution';
import Attendance from './models/Attendance';
import CustomerVisit from './models/CustomerVisit';
import SyncMeta from './models/SyncMeta';
import SellingSku from './models/SellingSku';
import ExpiryCheck from './models/ExpiryCheck';
import CompetitorBrand from './models/CompetitorBrand';
import CompetitorObservation from './models/CompetitorObservation';
import OpeningStock from './models/OpeningStock';
import PhysicalStock from './models/PhysicalStock';
import OsoiPhoto from './models/OsoiPhoto';
import PoCapture from './models/PoCapture';
import PoCaptureItem from './models/PoCaptureItem';
import Initiative from './models/Initiative';
import InitiativeExecution from './models/InitiativeExecution';
import ProductSampling from './models/ProductSampling';
import PermanentDisplay from './models/PermanentDisplay';
import PermanentDisplayCheck from './models/PermanentDisplayCheck';
import Survey from './models/Survey';
import SurveyResponse from './models/SurveyResponse';
import Prospect from './models/Prospect';
import Collection from './models/Collection';
import VanStockRecord from './models/VanStockRecord';
import PriceCheck from './models/PriceCheck';
import ApprovalRecord from './models/ApprovalRecord';
import RotaDraft from './models/RotaDraft';
import PlanogramSetup from './models/PlanogramSetup';
import AppSetting from './models/AppSetting';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,
  onSetUpError: (error) => {
    console.error('WatermelonDB setup error:', error);
  },
});

const database = new Database({
  adapter,
  modelClasses: [
    Customer,
    Item,
    Price,
    JourneyPlanCustomer,
    Order,
    OrderLine,
    StoreCheck,
    StoreCheckItem,
    PlanogramExecution,
    Attendance,
    CustomerVisit,
    SyncMeta,
    SellingSku,
    ExpiryCheck,
    CompetitorBrand,
    CompetitorObservation,
    OpeningStock,
    PhysicalStock,
    OsoiPhoto,
    PoCapture,
    PoCaptureItem,
    Initiative,
    InitiativeExecution,
    ProductSampling,
    PermanentDisplay,
    PermanentDisplayCheck,
    Survey,
    SurveyResponse,
    Prospect,
    Collection,
    VanStockRecord,
    PriceCheck,
    ApprovalRecord,
    RotaDraft,
    PlanogramSetup,
    AppSetting,
  ],
});

export default database;
