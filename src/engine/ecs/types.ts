import type {
  BuildingKind,
  FactionId,
  ProductionCategory,
  UnitKind,
} from "../../shared/constants";

export interface TransformComponent {
  x: number;
  y: number;
  angleIndex: number; // 0..15
  turretAngleIndex: number; // 0..15
}

export interface HealthComponent {
  hp: number;
  maxHp: number;
}

export interface NavigationComponent {
  path: Array<{ x: number; y: number }>;
  pathIndex: number;
  speedTilesPerTick: number;
  targetX: number | null;
  targetY: number | null;
  waitTicks: number;
}

export interface CombatComponent {
  detectionRange: number;
  attackRange: number;
  attackDamage: number;
  attackCooldownTicks: number;
  cooldownRemaining: number;
  targetEntityId: string | null;
}

export interface HarvesterComponent {
  cargoOre: number;
  maxCapacity: number;
  state: "IDLE" | "MOVING_TO_ORE" | "HARVESTING" | "RETURNING_TO_REFINERY";
  targetOreTile: { x: number; y: number } | null;
  homeRefineryId: string | null;
}

export interface BuildingComponent {
  footprintW: number;
  footprintH: number;
  powerDelta: number;
  storageCapacity: number;
}

export interface EcsEntity {
  id: string;
  ownerId: string;
  faction: FactionId;
  entityType: "BUILDING" | "UNIT";
  kind: BuildingKind | UnitKind;
  sightRadius: number;
  spawnProtectionTicks: number;
  stateLabel: "IDLE" | "MOVING" | "HARVESTING" | "RETURNING" | "ALERT" | "ATTACKING";
  transform: TransformComponent;
  health: HealthComponent;
  navigation: NavigationComponent | null;
  combat: CombatComponent | null;
  harvester: HarvesterComponent | null;
  building: BuildingComponent | null;
  dirty: boolean;
}

export interface ProductionSlotState {
  category: ProductionCategory;
  activeItem: BuildingKind | UnitKind | null;
  ticksElapsed: number;
  ticksRequired: number;
  readyToPlace: boolean;
}

export interface PlayerSimState {
  playerId: string;
  commanderName: string;
  faction: FactionId;
  isAi: boolean;
  credits: number;
  maxStorage: number;
  powerProduced: number;
  powerConsumed: number;
  lowPower: boolean;
  radarActive: boolean;
  harvestedTotal: number;
  defeated: boolean;
  lowPowerAlertSent: boolean;
  silosAlertSent: boolean;
  underAttackCooldown: number;
  aiDecisionCooldown: number;
  queues: Record<ProductionCategory, ProductionSlotState>;
}
