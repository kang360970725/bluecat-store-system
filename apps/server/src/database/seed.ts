import { MemberPriceTier, PrismaClient, StoreAreaLevel } from '@prisma/client';
import { hash } from 'bcryptjs';
import { config } from 'dotenv';

config({ path: '../../.env' });

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.org.upsert({
    where: { code: 'HQ' },
    update: { name: '蓝猫总部' },
    create: {
      code: 'HQ',
      name: '蓝猫总部'
    }
  });

  await prisma.v2Organization.upsert({
    where: { code: 'HQ' },
    update: {
      type: 'HEADQUARTERS',
      name: '蓝猫总部',
      enabled: true,
      deletedAt: null
    },
    create: {
      type: 'HEADQUARTERS',
      code: 'HQ',
      name: '蓝猫总部',
      enabled: true
    }
  });

  const store = await prisma.store.upsert({
    where: { code: 'STORE-001' },
    update: {
      name: '默认门店',
      orgId: org.id,
      machineCount: 120
    },
    create: {
      code: 'STORE-001',
      name: '默认门店',
      orgId: org.id,
      machineCount: 120,
      address: '默认地址'
    }
  });

  const employee = await prisma.employee.upsert({
    where: { employeeNo: 'EMP-001' },
    update: {
      name: '默认店长',
      storeId: store.id,
      position: '店长',
      enabled: true
    },
    create: {
      employeeNo: 'EMP-001',
      name: '默认店长',
      storeId: store.id,
      position: '店长'
    }
  });

  await prisma.store.update({
    where: { id: store.id },
    data: {
      managerEmployeeId: employee.id,
      responsibleEmployeeId: employee.id
    }
  });

  const area = await prisma.storeArea.upsert({
    where: {
      storeId_code: {
        storeId: store.id,
        code: 'ZOWIE-360-SINGLE'
      }
    },
    update: {
      name: '卓威360单包',
      level: StoreAreaLevel.HIGH,
      machineCount: 12,
      gpuModel: 'RTX 4070 SUPER',
      cpuModel: 'Intel i7-14700F',
      monitorModel: 'ZOWIE XL2566K 360Hz',
      deletedAt: null
    },
    create: {
      storeId: store.id,
      code: 'ZOWIE-360-SINGLE',
      name: '卓威360单包',
      level: StoreAreaLevel.HIGH,
      machineCount: 12,
      gpuModel: 'RTX 4070 SUPER',
      cpuModel: 'Intel i7-14700F',
      monitorModel: 'ZOWIE XL2566K 360Hz'
    }
  });

  await Promise.all(
    [
      { tier: MemberPriceTier.TEMPORARY, price: 12 },
      { tier: MemberPriceTier.NORMAL_MEMBER, price: 10 },
      { tier: MemberPriceTier.BLUECAT_MEMBER, price: 9 },
      { tier: MemberPriceTier.EXTRAORDINARY_MEMBER, price: 8 },
      { tier: MemberPriceTier.APEX_MEMBER, price: 7 },
      { tier: MemberPriceTier.PLATINUM_MEMBER, price: 6 },
      { tier: MemberPriceTier.BLACK_GOLD_MEMBER, price: 5 },
      { tier: MemberPriceTier.MYTHIC_MEMBER, price: 4 }
    ].map((price) =>
      prisma.storeAreaPrice.upsert({
        where: {
          areaId_tier: {
            areaId: area.id,
            tier: price.tier
          }
        },
        update: {
          price: price.price,
          deletedAt: null
        },
        create: {
          areaId: area.id,
          tier: price.tier,
          price: price.price
        }
      })
    )
  );

  const permissions = await Promise.all(
    [
      { code: 'dashboard:view', name: '查看工作台', type: 'page', path: '/' },
      { code: 'iam:view', name: '查看权限模块', type: 'page', path: '/iam' },
      { code: 'org:view', name: '查看组织', type: 'api', path: '/orgs' },
      { code: 'org:create', name: '创建组织', type: 'api', path: '/orgs' },
      { code: 'org:update', name: '更新组织', type: 'api', path: '/orgs/:id' },
      { code: 'org:delete', name: '删除组织', type: 'api', path: '/orgs/:id' },
      {
        code: 'store:view',
        name: '查看门店模块',
        type: 'api',
        path: '/stores'
      },
      { code: 'store:create', name: '创建门店', type: 'api', path: '/stores' },
      {
        code: 'store:update',
        name: '更新门店',
        type: 'api',
        path: '/stores/:id'
      },
      {
        code: 'store:delete',
        name: '删除门店',
        type: 'api',
        path: '/stores/:id'
      },
      {
        code: 'employee:view',
        name: '查看员工',
        type: 'api',
        path: '/stores/employees'
      },
      {
        code: 'employee:create',
        name: '创建员工',
        type: 'api',
        path: '/stores/employees'
      },
      {
        code: 'employee:update',
        name: '更新员工',
        type: 'api',
        path: '/stores/employees/:id'
      },
      {
        code: 'employee:delete',
        name: '删除员工',
        type: 'api',
        path: '/stores/employees/:id'
      },
      {
        code: 'store-area:view',
        name: '查看门店区域',
        type: 'api',
        path: '/stores/areas'
      },
      {
        code: 'store-area:create',
        name: '创建门店区域',
        type: 'api',
        path: '/stores/areas'
      },
      {
        code: 'store-area:update',
        name: '更新门店区域',
        type: 'api',
        path: '/stores/areas/:id'
      },
      {
        code: 'store-area:delete',
        name: '删除门店区域',
        type: 'api',
        path: '/stores/areas/:id'
      },
      {
        code: 'store-area-price:update',
        name: '更新区域价格',
        type: 'api',
        path: '/stores/areas/:id/prices'
      },
      {
        code: 'performance:view',
        name: '查看门店业绩指标',
        type: 'api',
        path: '/performances/monthly'
      },
      {
        code: 'performance:update',
        name: '更新门店业绩指标',
        type: 'api',
        path: '/performances/monthly/:storeId'
      },
      {
        code: 'performance-split:view',
        name: '查看业绩拆分',
        type: 'api',
        path: '/performances/splits'
      },
      {
        code: 'performance-split:update',
        name: '更新业绩拆分',
        type: 'api',
        path: '/performances/splits/:id'
      },
      {
        code: 'schedule:view',
        name: '查看门店排班',
        type: 'api',
        path: '/performances/schedules'
      },
      {
        code: 'schedule:update',
        name: '更新门店排班',
        type: 'api',
        path: '/performances/schedules'
      },
      {
        code: 'scoring:view',
        name: '查看门店评分',
        type: 'api',
        path: '/scoring/monthly'
      },
      {
        code: 'scoring:update',
        name: '录入门店评分',
        type: 'api',
        path: '/scoring/entries'
      },
      {
        code: 'scoring:config',
        name: '配置计分项目',
        type: 'api',
        path: '/scoring/items'
      },
      {
        code: 'permission:view',
        name: '查看权限',
        type: 'api',
        path: '/iam/permissions'
      },
      {
        code: 'permission:create',
        name: '创建权限',
        type: 'api',
        path: '/iam/permissions'
      },
      {
        code: 'permission:update',
        name: '更新权限',
        type: 'api',
        path: '/iam/permissions/:id'
      },
      {
        code: 'permission:delete',
        name: '删除权限',
        type: 'api',
        path: '/iam/permissions/:id'
      },
      { code: 'role:view', name: '查看角色', type: 'api', path: '/iam/roles' },
      {
        code: 'role:create',
        name: '创建角色',
        type: 'api',
        path: '/iam/roles'
      },
      {
        code: 'role:update',
        name: '更新角色',
        type: 'api',
        path: '/iam/roles/:id'
      },
      {
        code: 'role:delete',
        name: '删除角色',
        type: 'api',
        path: '/iam/roles/:id'
      },
      {
        code: 'position:view',
        name: '查看岗位',
        type: 'api',
        path: '/iam/positions'
      },
      {
        code: 'position:create',
        name: '创建岗位',
        type: 'api',
        path: '/iam/positions'
      },
      {
        code: 'position:update',
        name: '更新岗位',
        type: 'api',
        path: '/iam/positions/:id'
      },
      {
        code: 'position:delete',
        name: '删除岗位',
        type: 'api',
        path: '/iam/positions/:id'
      },
      { code: 'user:view', name: '查看用户', type: 'api', path: '/iam/users' },
      {
        code: 'user:create',
        name: '创建用户',
        type: 'api',
        path: '/iam/users'
      },
      {
        code: 'user:update',
        name: '更新用户',
        type: 'api',
        path: '/iam/users/:id'
      },
      {
        code: 'user:delete',
        name: '删除用户',
        type: 'api',
        path: '/iam/users/:id'
      },
      {
        code: 'finance.payroll:view_summary',
        name: '查看工资汇总',
        type: 'api',
        path: '/v2/finance/payroll-batches'
      },
      {
        code: 'finance.payroll:view_sensitive',
        name: '查看个人工资明细',
        type: 'api',
        path: '/v2/finance/payroll-batches/:id'
      },
      {
        code: 'finance.payroll:view_all_stores',
        name: '查看全部门店工资',
        type: 'api',
        path: '/v2/finance/payroll-batches/:id'
      },
      {
        code: 'finance.payroll:manage',
        name: '管理工资批次',
        type: 'api',
        path: '/v2/finance/payroll-batches'
      },
      {
        code: 'finance.payroll:edit_inputs',
        name: '编辑工资基础数据',
        type: 'api',
        path: '/v2/finance/payroll-batches/:id/store-profit'
      },
      {
        code: 'finance.payroll:calculate',
        name: '执行工资计算与退回',
        type: 'api',
        path: '/v2/finance/payroll-batches/:id/transition'
      },
      {
        code: 'finance.payroll:review',
        name: '复核工资',
        type: 'api',
        path: '/v2/finance/payroll-batches/:id/transition'
      },
      {
        code: 'finance.payroll:approve',
        name: '审批工资',
        type: 'api',
        path: '/v2/finance/payroll-batches/:id/transition'
      },
      {
        code: 'finance.payroll:lock',
        name: '锁定工资',
        type: 'api',
        path: '/v2/finance/payroll-batches/:id/transition'
      },
      {
        code: 'finance.payroll:pay',
        name: '确认工资发放',
        type: 'api',
        path: '/v2/finance/payroll-batches/:id/transition'
      },
      {
        code: 'finance.payroll:export',
        name: '导出工资数据',
        type: 'api',
        path: '/v2/finance/payroll-batches/:id/export'
      },
      {
        code: 'finance.payroll:audit',
        name: '查看工资审计日志',
        type: 'api',
        path: '/v2/finance/payroll-batches/:id/audit'
      }
    ].map((permission) =>
      prisma.permission.upsert({
        where: { code: permission.code },
        update: permission,
        create: permission
      })
    )
  );

  const permissionByCode = new Map(
    permissions.map((permission) => [permission.code, permission])
  );
  const positionPermissions = [
    'store:view',
    'store:update',
    'employee:view',
    'employee:create',
    'employee:update',
    'employee:delete',
    'store-area:view',
    'store-area:create',
    'store-area:update',
    'store-area:delete',
    'store-area-price:update',
    'performance:view',
    'performance-split:view',
    'schedule:view',
    'scoring:view',
    'position:view'
  ];
  const managerPosition = await prisma.position.upsert({
    where: { code: 'store_manager' },
    update: {
      name: '店长',
      description: '维护自己负责门店的门店资料、员工、区域和价格',
      deletedAt: null
    },
    create: {
      code: 'store_manager',
      name: '店长',
      description: '维护自己负责门店的门店资料、员工、区域和价格'
    }
  });
  const responsiblePosition = await prisma.position.upsert({
    where: { code: 'store_responsible' },
    update: {
      name: '负责人',
      description: '维护自己负责门店的基础运营资料',
      deletedAt: null
    },
    create: {
      code: 'store_responsible',
      name: '负责人',
      description: '维护自己负责门店的基础运营资料'
    }
  });
  await prisma.position.upsert({
    where: { code: 'store_staff' },
    update: {
      name: '员工',
      description: '门店基础员工岗位',
      deletedAt: null
    },
    create: {
      code: 'store_staff',
      name: '员工',
      description: '门店基础员工岗位'
    }
  });

  await Promise.all(
    [managerPosition, responsiblePosition].flatMap((position) =>
      positionPermissions.map((code) => {
        const permission = permissionByCode.get(code);
        if (!permission) {
          throw new Error(`Permission ${code} not found`);
        }
        return prisma.positionPermission.upsert({
          where: {
            positionId_permissionId: {
              positionId: position.id,
              permissionId: permission.id
            }
          },
          update: {},
          create: {
            positionId: position.id,
            permissionId: permission.id
          }
        });
      })
    )
  );

  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      positionId: managerPosition.id,
      position: '店长'
    }
  });

  await prisma.workShift.upsert({
    where: { code: 'day' },
    update: {
      name: '白班',
      sort: 1,
      startTime: '09:00',
      endTime: '18:00',
      deletedAt: null
    },
    create: {
      code: 'day',
      name: '白班',
      sort: 1,
      startTime: '09:00',
      endTime: '18:00'
    }
  });

  const scoreItems = [
    [
      'manager',
      '店经理评比',
      '日常扣分',
      'manager_daily_deduct',
      20,
      -100,
      '第一部分：日常得分，当前公式后续补充'
    ],
    [
      'manager',
      '店经理评比',
      '日常加分',
      'manager_daily_bonus',
      20,
      0,
      '第一部分：日常得分，当前公式后续补充'
    ],
    [
      'manager',
      '店经理评比',
      '业绩达成',
      'manager_performance_completion',
      40,
      0,
      '第二部分：门店业绩完成分'
    ],
    [
      'manager',
      '店经理评比',
      '稽核得分',
      'manager_audit_score',
      20,
      0,
      '第三部分：门店稽核得分'
    ],
    [
      'manager',
      '店经理评比',
      '高级会员得分',
      'manager_vip_score',
      10,
      0,
      '第四部分：高级会员得分'
    ],
    [
      'manager',
      '店经理评比',
      '投诉扣分',
      'manager_complaint_deduct',
      10,
      -100,
      '第五部分：投诉扣分，录入扣分值或折算后得分'
    ],
    [
      'store',
      '优秀门店',
      '任务达成率',
      'store_task_completion',
      50,
      0,
      '门店任务达成率，公式后续补充'
    ],
    [
      'store',
      '优秀门店',
      '稽核得分',
      'store_audit_score',
      20,
      0,
      '门店稽核得分'
    ],
    [
      'store',
      '优秀门店',
      '调查问卷',
      'store_questionnaire_score',
      15,
      0,
      '调查问卷得分'
    ],
    [
      'store',
      '优秀门店',
      '神访得分',
      'store_mystery_visit_score',
      15,
      0,
      '神访第一次/第二次平均分'
    ],
    [
      'store',
      '优秀门店',
      '其他得分',
      'store_other_score',
      10,
      -10,
      '其他得分区间 -10 至 10'
    ],
    [
      'hygiene',
      '卫生标兵',
      '稽核',
      'hygiene_audit',
      100,
      0,
      '卫生标兵：稽核维度'
    ],
    [
      'hygiene',
      '卫生标兵',
      '神访',
      'hygiene_mystery_visit',
      100,
      0,
      '卫生标兵：神访维度'
    ],
    [
      'hygiene',
      '卫生标兵',
      '门店投诉',
      'hygiene_complaint',
      0,
      -100,
      '卫生标兵：投诉扣分'
    ],
    [
      'service',
      '金牌客服',
      '玩家调查',
      'service_player_survey',
      30,
      0,
      '金牌客服：玩家调查，上限 30'
    ],
    [
      'service',
      '金牌客服',
      '现场督导',
      'service_supervision',
      40,
      0,
      '金牌客服：现场督导，上限 40'
    ],
    [
      'service',
      '金牌客服',
      '企微目标',
      'service_wecom_target',
      30,
      0,
      '金牌客服：企微目标，上限 30'
    ],
    [
      'service',
      '金牌客服',
      '高等级会员',
      'service_vip_member',
      null,
      0,
      '金牌客服：高等级会员，公式后续补充'
    ],
    [
      'sales',
      '王牌销冠',
      '达成率',
      'sales_completion_rate',
      null,
      0,
      '王牌销冠：达成率'
    ],
    [
      'sales',
      '王牌销冠',
      '加权得分',
      'sales_weighted_score',
      null,
      0,
      '王牌销冠：加权得分'
    ],
    [
      'audit',
      '稽核冠军',
      '稽核分',
      'audit_champion_score',
      100,
      0,
      '稽核冠军得分'
    ],
    [
      'assault',
      '突击精英',
      '第一次神访',
      'assault_first_visit',
      100,
      0,
      '突击精英：第一次神访'
    ],
    [
      'assault',
      '突击精英',
      '第二次神访',
      'assault_second_visit',
      100,
      0,
      '突击精英：第二次神访'
    ],
    [
      'assault',
      '突击精英',
      '平均分',
      'assault_average_score',
      100,
      0,
      '突击精英：平均分'
    ]
  ] as const;

  await Promise.all(
    scoreItems.map(
      (
        [
          categoryCode,
          categoryName,
          name,
          code,
          maxScore,
          minScore,
          formulaNote
        ],
        index
      ) =>
        prisma.scoreItem.upsert({
          where: { code },
          update: {
            categoryCode,
            categoryName,
            name,
            maxScore,
            minScore,
            formulaNote,
            sort: index + 1,
            enabled: true,
            deletedAt: null
          },
          create: {
            categoryCode,
            categoryName,
            name,
            code,
            maxScore,
            minScore,
            formulaNote,
            sort: index + 1
          }
        })
    )
  );

  await prisma.workShift.upsert({
    where: { code: 'night' },
    update: {
      name: '晚班',
      sort: 2,
      startTime: '18:00',
      endTime: '03:00',
      deletedAt: null
    },
    create: {
      code: 'night',
      name: '晚班',
      sort: 2,
      startTime: '18:00',
      endTime: '03:00'
    }
  });

  const role = await prisma.role.upsert({
    where: { code: 'super_admin' },
    update: {
      name: '超级管理员',
      dataScope: 'ALL'
    },
    create: {
      code: 'super_admin',
      name: '超级管理员',
      dataScope: 'ALL'
    }
  });

  await Promise.all(
    permissions.map((permission) =>
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id
          }
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id
        }
      })
    )
  );

  const passwordHash = await hash('admin123', 10);
  const user = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      nickname: '系统管理员',
      orgId: org.id,
      storeId: store.id,
      enabled: true
    },
    create: {
      username: 'admin',
      nickname: '系统管理员',
      passwordHash,
      orgId: org.id,
      storeId: store.id
    }
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: role.id
      }
    },
    update: {},
    create: {
      userId: user.id,
      roleId: role.id
    }
  });

  const managerPasswordHash = await hash('manager123', 10);
  const managerUser = await prisma.user.upsert({
    where: { username: 'manager' },
    update: {
      nickname: '默认店长',
      orgId: org.id,
      storeId: store.id,
      enabled: true
    },
    create: {
      username: 'manager',
      nickname: '默认店长',
      passwordHash: managerPasswordHash,
      orgId: org.id,
      storeId: store.id
    }
  });

  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      userId: managerUser.id,
      positionId: managerPosition.id,
      position: '店长'
    }
  });

  const performanceMonth = new Date('2026-07-01T00:00:00.000Z');
  const previousPerformanceMonth = new Date('2026-06-01T00:00:00.000Z');
  await prisma.storePerformanceTarget.upsert({
    where: {
      storeId_month: {
        storeId: store.id,
        month: performanceMonth
      }
    },
    update: {
      targetRevenue: 286000,
      netFeeTarget: 228800,
      productTarget: 57200,
      managementFee: 27000,
      rent: 52000,
      propertyTrashFee: 3600,
      utilities: 30000,
      drinkMaterial: 12500,
      mealMaterial: 4500,
      welfare: 6400,
      salary: 56000,
      franchiseFee: 4000,
      baseOperationSoftware: 1200,
      storeOperation: 2500,
      advertisingMaterial: 300,
      financeTax: 3500,
      withdrawalFee: 8131,
      deletedAt: null
    },
    create: {
      storeId: store.id,
      month: performanceMonth,
      targetRevenue: 286000,
      netFeeTarget: 228800,
      productTarget: 57200,
      managementFee: 27000,
      rent: 52000,
      propertyTrashFee: 3600,
      utilities: 30000,
      drinkMaterial: 12500,
      mealMaterial: 4500,
      welfare: 6400,
      salary: 56000,
      franchiseFee: 4000,
      baseOperationSoftware: 1200,
      storeOperation: 2500,
      advertisingMaterial: 300,
      financeTax: 3500,
      withdrawalFee: 8131
    }
  });

  await prisma.storePerformanceTarget.upsert({
    where: {
      storeId_month: {
        storeId: store.id,
        month: previousPerformanceMonth
      }
    },
    update: {
      targetRevenue: 260000,
      netFeeTarget: 208000,
      productTarget: 52000,
      managementFee: 26000,
      rent: 52000,
      propertyTrashFee: 3600,
      utilities: 28000,
      drinkMaterial: 11000,
      mealMaterial: 4200,
      welfare: 6000,
      salary: 54000,
      franchiseFee: 4000,
      baseOperationSoftware: 1200,
      storeOperation: 2500,
      advertisingMaterial: 300,
      financeTax: 3500,
      withdrawalFee: 7600,
      deletedAt: null
    },
    create: {
      storeId: store.id,
      month: previousPerformanceMonth,
      targetRevenue: 260000,
      netFeeTarget: 208000,
      productTarget: 52000,
      managementFee: 26000,
      rent: 52000,
      propertyTrashFee: 3600,
      utilities: 28000,
      drinkMaterial: 11000,
      mealMaterial: 4200,
      welfare: 6000,
      salary: 54000,
      franchiseFee: 4000,
      baseOperationSoftware: 1200,
      storeOperation: 2500,
      advertisingMaterial: 300,
      financeTax: 3500,
      withdrawalFee: 7600
    }
  });

  await prisma.storePerformanceActualSnapshot.upsert({
    where: {
      storeId_month_source: {
        storeId: store.id,
        month: performanceMonth,
        source: 'third_party'
      }
    },
    update: {
      amount: 277616,
      syncedAt: new Date(),
      deletedAt: null
    },
    create: {
      storeId: store.id,
      month: performanceMonth,
      source: 'third_party',
      amount: 277616,
      syncedAt: new Date()
    }
  });

  await prisma.storePerformanceEstimateSnapshot.upsert({
    where: {
      storeId_month_source: {
        storeId: store.id,
        month: performanceMonth,
        source: 'split_plan'
      }
    },
    update: {
      amount: 286000,
      syncedAt: new Date(),
      deletedAt: null
    },
    create: {
      storeId: store.id,
      month: performanceMonth,
      source: 'split_plan',
      amount: 286000,
      syncedAt: new Date()
    }
  });

  console.log('Seed data ready');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
