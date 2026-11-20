import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as ExcelJS from 'exceljs';
import type { CurrentUser } from '@bluecat/shared';
import { Prisma, V2CostFrequency, V2LeaveStatus, V2PositionSource } from '@prisma/client';
import { resolveScopedPermission } from '../../common/scoped-permission';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateV2EmployeeDto,
  CreateV2EmployeePayrollProfileDto,
  CreateV2PayrollGradeDto,
  ChangeV2EmploymentDto,
  ChangeV2ManagerStoreDto,
  CreateV2EmployeeLeaveDto,
  CreateV2OrganizationDto,
  CreateV2PositionTemplateDto,
  CreateV2StoreAssetDto,
  CreateV2StoreAreaDto,
  CreateV2AccountDto,
  CreateV2RoleDto,
  CreateV2StoreCostDto,
  CorrectV2StoreCostDto,
  CreateV2StoreDto,
  CreateV2StoreInvestmentDto,
  CreateV2StorePositionDto,
  TerminateV2EmployeeDto,
  UpdateV2EmployeeDto,
  UpdateV2StoreAreaDto,
  UpdateV2StoreAssetDto,
  UpdateV2StoreCostDto,
  UpdateV2StoreDto,
  UpdateV2PayrollGradeDto,
  UpdateV2PositionTemplateDto,
  UpdateV2StoreInvestmentDto,
  UpdateV2StorePositionDto,
  UpsertV2OperatingProfileDto
} from './dto';

@Injectable()
export class V2MasterDataService {
  constructor(private readonly prisma: PrismaService) {}

  async buildEmployeeImportTemplate(user: CurrentUser) {
    const scopedStoreIds = user.roles.includes('super_admin') ? undefined : user.accessibleStoreIds;
    const [stores, positionTemplates, organizations, gradeRows] = await Promise.all([
      this.prisma.v2Store.findMany({ where: { deletedAt: null, status: { not: 'CLOSED' }, ...(scopedStoreIds ? { id: { in: scopedStoreIds } } : {}) }, select: { code: true, name: true }, orderBy: { code: 'asc' } }),
      this.prisma.v2PositionTemplate.findMany({ where: { enabled: true, deletedAt: null }, select: { name: true, code: true }, orderBy: [{ sort: 'asc' }, { code: 'asc' }] }),
      this.prisma.v2Organization.findMany({ where: { type: 'HEADQUARTERS', enabled: true, deletedAt: null }, include: { positions: { where: { enabled: true, deletedAt: null }, orderBy: [{ sort: 'asc' }, { code: 'asc' }] } } }),
      this.prisma.v2PayrollProfileTemplate.findMany({ where: { employeeType: { in: ['STORE_MANAGER', 'HEAD_OFFICE'] }, enabled: true }, select: { employeeType: true, grade: true }, orderBy: { grade: 'asc' } })
    ]);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BlueCat Store System';
    const sheet = workbook.addWorksheet('员工导入', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(['姓名*', '手机号*', '入职日期*', '任职类型*', '门店/总部组织*', '岗位*', '薪酬方式*', 'P等级', 'M等级', '管理门店', '自动开通账号']);
    sheet.columns = [18, 18, 15, 16, 28, 24, 16, 12, 12, 28, 18].map((width) => ({ width }));
    sheet.getRow(1).height = 28;
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    const orgPositions = organizations.flatMap((org) => org.positions.map((position) => ({ org: org.name, position })));
    const scopeOptions = [...new Set([...stores.map((item) => item.name), ...organizations.map((item) => item.name)])];
    const positionOptions = [...new Set([...positionTemplates.map((item) => item.name), ...orgPositions.map((item) => item.position.name)])];
    const pGrades = [...new Set(gradeRows.filter((item) => item.employeeType === 'STORE_MANAGER').map((item) => item.grade).filter(Boolean))] as string[];
    const mGrades = [...new Set(gradeRows.filter((item) => item.employeeType === 'HEAD_OFFICE').map((item) => item.grade).filter(Boolean))] as string[];
    const helperLists = [scopeOptions, positionOptions, pGrades, mGrades, stores.map((item) => item.name)];
    helperLists.forEach((list, listIndex) => {
      const column = 13 + listIndex;
      list.forEach((value, index) => { sheet.getCell(index + 2, column).value = value; });
      sheet.getColumn(column).hidden = true;
    });
    const listFormula = (column: string, count: number) => `'员工导入'!$${column}$2:$${column}$${Math.max(count + 1, 2)}`;
    for (let row = 2; row <= 501; row += 1) {
      sheet.getCell(`C${row}`).numFmt = 'yyyy-mm-dd';
      sheet.getCell(`D${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"门店,总部职能"'] };
      sheet.getCell(`E${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: [listFormula('M', scopeOptions.length)] };
      sheet.getCell(`F${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: [listFormula('N', positionOptions.length)] };
      sheet.getCell(`G${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"月薪,时薪"'] };
      sheet.getCell(`H${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: [listFormula('O', pGrades.length)] };
      sheet.getCell(`I${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: [listFormula('P', mGrades.length)] };
      sheet.getCell(`J${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: [listFormula('Q', stores.length)] };
      sheet.getCell(`K${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"是,否"'] };
    }
    sheet.autoFilter = { from: 'A1', to: 'K501' };
    const guide = workbook.addWorksheet('填写说明');
    guide.columns = [{ width: 22 }, { width: 84 }];
    guide.addRows([
      ['字段', '填写规则'],
      ['姓名、手机号、入职日期', '必填。手机号须为11位中国大陆手机号；日期格式为yyyy-mm-dd。'],
      ['任职类型', '填写“门店”或“总部职能”。'],
      ['门店/总部组织', '填写字典页中的名称或编码，须与任职类型一致。'],
      ['岗位', '门店员工填写统一岗位模板名称或编码；总部职能填写总部岗位名称或编码。'],
      ['薪酬方式', '填写“月薪”或“时薪”。店长职能岗仅支持月薪。'],
      ['P等级、管理门店', '店长职能岗必填；其他岗位留空。'],
      ['M等级', '总部普通职能岗按实际职级选择；不涉及M等级的岗位留空。'],
      ['自动开通账号', '默认“是”。账号为手机号，初始密码123456，首次登录必须修改。'],
      ['导入规则', '空行不计入执行数。重复或格式不符合要求的行会跳过，其他行继续执行。']
    ]);
    guide.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    guide.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    guide.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true }; });
    const dict = workbook.addWorksheet('可用数据字典');
    dict.columns = [24, 20, 26, 20, 30, 20, 18].map((width) => ({ width }));
    dict.addRow(['门店名称', '门店编码', '门店岗位', '岗位编码', '总部组织 / 岗位', '岗位编码', 'P等级']);
    const max = Math.max(stores.length, positionTemplates.length, orgPositions.length, gradeRows.length, 1);
    for (let i = 0; i < max; i += 1) {
      dict.addRow([stores[i]?.name ?? '', stores[i]?.code ?? '', positionTemplates[i]?.name ?? '', positionTemplates[i]?.code ?? '', orgPositions[i] ? `${orgPositions[i].org} / ${orgPositions[i].position.name}` : '', orgPositions[i]?.position.code ?? '', gradeRows[i]?.grade ?? '']);
    }
    dict.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    dict.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importEmployees(buffer: Buffer, user: CurrentUser) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('员工导入') ?? workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('Excel中未找到员工导入工作表');
    const failures: Array<{ row: number; reason: string }> = [];
    let total = 0;
    let success = 0;
    const text = (value: ExcelJS.CellValue) => {
      if (value == null) return '';
      if (typeof value === 'object' && 'text' in value) return String(value.text).trim();
      return String(value).trim();
    };
    const dateText = (value: ExcelJS.CellValue) => value instanceof Date ? value.toISOString().slice(0, 10) : (/^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : '');
    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => headers.set(text(cell.value).replace(/\*/g, ''), column));
    const cellText = (row: ExcelJS.Row, name: string, fallback: number) => text(row.getCell(headers.get(name) ?? fallback).value);
    for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo += 1) {
      const row = sheet.getRow(rowNo);
      const isNewTemplate = headers.has('M等级');
      const values = [
        cellText(row, '姓名', 1), cellText(row, '手机号', 2), cellText(row, '入职日期', 3),
        cellText(row, '任职类型', 4), cellText(row, '门店/总部组织', 5), cellText(row, '岗位', 6),
        cellText(row, '薪酬方式', 7), cellText(row, 'P等级', 8), cellText(row, 'M等级', 9),
        cellText(row, '管理门店', isNewTemplate ? 10 : 9), cellText(row, '自动开通账号', isNewTemplate ? 11 : 10)
      ];
      if (values.every((value) => !value)) continue;
      total += 1;
      try {
        const [name, phone, , assignmentType, scope, positionName, compensation, pGrade, mGrade, managedStore, createAccount] = values;
        const hiredOn = dateText(row.getCell(3).value);
        if (!name || !phone || !hiredOn || !assignmentType || !scope || !positionName || !compensation) throw new Error('格式不符合要求，必填字段缺失');
        if (!/^1\d{10}$/.test(phone)) throw new Error('格式不符合要求，手机号格式错误');
        if (!['门店', '总部职能'].includes(assignmentType)) throw new Error('格式不符合要求，任职类型无效');
        if (!['月薪', '时薪'].includes(compensation)) throw new Error('格式不符合要求，薪酬方式无效');
        if (await this.prisma.v2Employee.findFirst({ where: { phone, deletedAt: null }, select: { id: true } })) throw new Error('数据重复，手机号已存在');
        const dto: CreateV2EmployeeDto = { name, phone, hiredOn, compensationType: compensation === '时薪' ? 'HOURLY' : 'MONTHLY', createLoginAccount: createAccount !== '否' };
        if (assignmentType === '门店') {
          const store = await this.prisma.v2Store.findFirst({ where: { OR: [{ name: scope }, { code: scope }], status: { not: 'CLOSED' }, deletedAt: null } });
          if (!store) throw new Error('格式不符合要求，门店不存在或已关闭');
          const position = await this.prisma.v2StorePosition.findFirst({ where: { storeId: store.id, enabled: true, deletedAt: null, OR: [{ name: positionName }, { code: positionName }, { template: { is: { name: positionName } } }, { template: { is: { code: positionName } } }] } });
          if (!position) throw new Error('格式不符合要求，门店岗位不存在');
          dto.storeId = store.id;
          dto.positionId = position.id;
        } else {
          if (!user.roles.includes('super_admin')) throw new Error('无权导入总部职能人员');
          const organization = await this.prisma.v2Organization.findFirst({ where: { OR: [{ name: scope }, { code: scope }], type: 'HEADQUARTERS', enabled: true, deletedAt: null } });
          if (!organization) throw new Error('格式不符合要求，总部组织不存在');
          const position = await this.prisma.v2OrganizationPosition.findFirst({ where: { organizationId: organization.id, enabled: true, deletedAt: null, OR: [{ name: positionName }, { code: positionName }] } });
          if (!position) throw new Error('格式不符合要求，总部岗位不存在');
          dto.organizationId = organization.id;
          dto.organizationPositionId = position.id;
          if (position.requiresPGrade) {
            if (!/^P\d{1,2}$/i.test(pGrade)) throw new Error('格式不符合要求，店长P等级缺失或无效');
            const store = await this.prisma.v2Store.findFirst({ where: { OR: [{ name: managedStore }, { code: managedStore }], status: { not: 'CLOSED' }, deletedAt: null } });
            if (!store) throw new Error('格式不符合要求，管理门店缺失或无效');
            dto.grade = pGrade.toUpperCase();
            dto.costStoreId = store.id;
          } else if (mGrade) {
            if (!/^M\d{1,2}$/i.test(mGrade)) throw new Error('格式不符合要求，M等级无效');
            dto.grade = mGrade.toUpperCase();
          }
        }
        await this.createEmployee(dto, user);
        success += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : '未知错误';
        failures.push({ row: rowNo, reason: /unique|duplicate/i.test(reason) ? '数据重复' : reason });
      }
    }
    return { total, success, failed: failures.length, failures };
  }

  private async syncEmployeePositionRole(
    tx: Prisma.TransactionClient,
    employeeId: string,
    userId: string
  ) {
    const account = await tx.v2Account.findUnique({
      where: { employeeId },
      select: { id: true }
    });
    if (!account) return;
    const [storeEmployments, organizationEmployments] = await Promise.all([
      tx.v2Employment.findMany({
        where: { employeeId, endedOn: null, deletedAt: null },
        select: {
          position: { select: { template: { select: { roleId: true } } } }
        }
      }),
      tx.v2OrganizationEmployment.findMany({
        where: { employeeId, endedOn: null, deletedAt: null },
        select: { position: { select: { roleId: true } } }
      })
    ]);
    const roleIds = [
      ...storeEmployments.map((item) => item.position.template?.roleId),
      ...organizationEmployments.map((item) => item.position.roleId)
    ].filter(Boolean) as string[];
    await tx.v2AccountRole.deleteMany({
      where: {
        accountId: account.id,
        role: { code: { not: 'super_admin' } }
      }
    });
    if (roleIds.length)
      await tx.v2AccountRole.createMany({
        data: [...new Set(roleIds)].map((roleId) => ({
          accountId: account.id,
          roleId,
          createdBy: userId
        }))
      });
  }

  listOverview(user?: CurrentUser) {
    const storeWhere =
      user && !user.roles.includes('super_admin')
        ? {
            id: { in: user.accessibleStoreIds },
            deletedAt: null,
            status: { not: 'CLOSED' as const }
          }
        : { deletedAt: null, status: { not: 'CLOSED' as const } };
    return Promise.all([
      this.prisma.v2Organization.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: {
          positions: {
            where: { enabled: true, deletedAt: null },
            orderBy: [{ sort: 'asc' }, { name: 'asc' }]
          },
          _count: {
            select: {
              employments: { where: { endedOn: null, deletedAt: null } }
            }
          }
        }
      }),
      this.prisma.v2Store.findMany({
        where: storeWhere,
        orderBy: { createdAt: 'asc' },
        include: {
          organization: { select: { id: true, name: true, code: true } },
          _count: {
            select: {
              employments: true,
              positions: { where: { deletedAt: null } }
            }
          },
          positions: {
            where: { deletedAt: null },
            orderBy: [{ sort: 'asc' }, { name: 'asc' }],
            select: {
              id: true,
              name: true,
              code: true,
              description: true,
              source: true,
              enabled: true,
              templateId: true,
              _count: {
                select: {
                  employments: { where: { endedOn: null, deletedAt: null } }
                }
              }
            }
          }
        }
      }),
      this.prisma.v2PositionTemplate.findMany({
        where: { deletedAt: null },
        orderBy: [{ sort: 'asc' }, { name: 'asc' }]
      })
    ]).then(([organizations, stores, positionTemplates]) => ({
      organizations,
      stores,
      positionTemplates
    }));
  }

  createOrganization(dto: CreateV2OrganizationDto, user: CurrentUser) {
    return this.prisma.v2Organization.create({
      data: { ...dto, createdBy: user.id, updatedBy: user.id }
    });
  }

  async createStore(dto: CreateV2StoreDto, user: CurrentUser) {
    const templates = await this.prisma.v2PositionTemplate.findMany({
      where: { enabled: true, deletedAt: null }
    });
    return this.prisma.$transaction(async (tx) => {
      const store = await tx.v2Store.create({
        data: {
          ...dto,
          openedOn: dto.openedOn ? new Date(dto.openedOn) : undefined,
          createdBy: user.id,
          updatedBy: user.id
        }
      });
      if (templates.length)
        await tx.v2StorePosition.createMany({
          data: templates.map((template) => ({
            storeId: store.id,
            templateId: template.id,
            source: V2PositionSource.SYSTEM_TEMPLATE,
            name: template.name,
            code: template.code,
            description: template.description,
            sort: template.sort,
            createdBy: user.id,
            updatedBy: user.id
          }))
        });
      return store;
    });
  }

  updateStore(id: string, dto: UpdateV2StoreDto, user: CurrentUser) {
    const { openedOn, ...data } = dto;
    return this.prisma.v2Store.update({
      where: { id },
      data: {
        ...data,
        openedOn: openedOn ? new Date(openedOn) : undefined,
        updatedBy: user.id
      }
    });
  }

  private async requireAssignablePositionRole(roleId: string) {
    const role = await this.prisma.v2Role.findFirst({
      where: { id: roleId, enabled: true, deletedAt: null, code: { not: 'super_admin' } },
      select: { id: true }
    });
    if (!role) throw new BadRequestException('请选择有效且可绑定岗位的角色');
  }

  async createPositionTemplate(
    dto: CreateV2PositionTemplateDto,
    user: CurrentUser
  ) {
    if (dto.roleId) await this.requireAssignablePositionRole(dto.roleId);
    const duplicate = await this.prisma.v2PositionTemplate.findFirst({
      where: { name: dto.name.trim(), deletedAt: null }
    });
    if (duplicate) throw new BadRequestException('已存在同名系统岗位模板');
    const { code: _requestedCode, ...data } = dto;
    const code = await this.nextCode('POSITION_TEMPLATE', 'POS');
    const defaultRole = dto.roleId
      ? null
      : await this.prisma.v2Role.findFirst({
          where: { code: 'store_staff', enabled: true, deletedAt: null }
        });
    const stores = await this.prisma.v2Store.findMany({
      where: { deletedAt: null, status: { not: 'CLOSED' } },
      select: { id: true }
    });
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.v2PositionTemplate.create({
        data: {
          ...data,
          roleId: dto.roleId ?? defaultRole?.id,
          code,
          createdBy: user.id,
          updatedBy: user.id
        }
      });
      if (stores.length)
        await tx.v2StorePosition.createMany({
          data: stores.map((store) => ({
            storeId: store.id,
            templateId: template.id,
            source: V2PositionSource.SYSTEM_TEMPLATE,
            name: template.name,
            code: template.code,
            description: template.description,
            sort: template.sort,
            createdBy: user.id,
            updatedBy: user.id
          }))
        });
      if (template.roleId) await tx.v2AuthorizationAudit.create({
        data: { subject: 'POSITION_TEMPLATE', subjectId: template.id, subjectName: template.name,
          actorId: user.id, after: { roleId: template.roleId } }
      });
      return template;
    });
  }

  async updatePositionTemplate(
    id: string,
    dto: UpdateV2PositionTemplateDto,
    user: CurrentUser
  ) {
    const existing = await this.prisma.v2PositionTemplate.findFirst({
      where: { id, deletedAt: null }
    });
    if (!existing) throw new NotFoundException('系统岗位不存在');
    if (dto.name && dto.name.trim() !== existing.name) {
      const duplicate = await this.prisma.v2PositionTemplate.findFirst({
        where: { name: dto.name.trim(), deletedAt: null, id: { not: id } }
      });
      if (duplicate) throw new BadRequestException('已存在同名系统岗位模板');
    }
    if (dto.roleId) await this.requireAssignablePositionRole(dto.roleId);
    const { code: _ignoredCode, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.v2PositionTemplate.findUniqueOrThrow({
        where: { id }, select: { roleId: true }
      });
      const template = await tx.v2PositionTemplate.update({
        where: { id },
        data: { ...data, updatedBy: user.id }
      });
      await tx.v2StorePosition.updateMany({
        where: { templateId: id, deletedAt: null },
        data: {
          name: data.name,
          description: data.description,
          sort: data.sort,
          updatedBy: user.id
        }
      });
      if (before.roleId !== template.roleId) await tx.v2AuthorizationAudit.create({
        data: { subject: 'POSITION_TEMPLATE', subjectId: id, subjectName: template.name,
          actorId: user.id, before: { roleId: before.roleId }, after: { roleId: template.roleId } }
      });
      return template;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async inheritPositionTemplates(storeId: string, user: CurrentUser) {
    const store = await this.prisma.v2Store.findFirst({
      where: { id: storeId, deletedAt: null, status: { not: 'CLOSED' } }
    });
    if (!store) throw new NotFoundException('门店不存在或已关闭');
    const [templateRows, existingPositions] = await Promise.all([
      this.prisma.v2PositionTemplate.findMany({
        where: { enabled: true, deletedAt: null }
      }),
      this.prisma.v2StorePosition.findMany({ where: { storeId } })
    ]);
    const templateCodes = new Set<string>();
    const templateNames = new Set<string>();
    const templates = templateRows.filter((template) => {
      const code = template.code.trim().toLowerCase();
      const name = template.name.trim().toLowerCase();
      if (templateCodes.has(code) || templateNames.has(name)) return false;
      templateCodes.add(code);
      templateNames.add(name);
      return true;
    });
    const operations = templates.flatMap((template) => {
      const exact = existingPositions.find(
        (item) => item.templateId === template.id
      );
      if (exact)
        return [
          this.prisma.v2StorePosition.update({
            where: { id: exact.id },
            data: {
              name: template.name,
              code: template.code,
              description: template.description,
              sort: template.sort,
              enabled: true,
              deletedAt: null,
              updatedBy: user.id
            }
          })
        ];
      const codeMatch = existingPositions.find(
        (item) =>
          item.code.trim().toLowerCase() === template.code.trim().toLowerCase()
      );
      if (codeMatch)
        return [
          this.prisma.v2StorePosition.update({
            where: { id: codeMatch.id },
            data: {
              templateId: template.id,
              source: V2PositionSource.SYSTEM_TEMPLATE,
              name: template.name,
              description: template.description,
              sort: template.sort,
              enabled: true,
              deletedAt: null,
              updatedBy: user.id
            }
          })
        ];
      const equivalent = existingPositions.find(
        (item) =>
          item.deletedAt === null &&
          item.name.trim().toLowerCase() === template.name.trim().toLowerCase()
      );
      if (equivalent) return [];
      return [
        this.prisma.v2StorePosition.create({
          data: {
            storeId,
            templateId: template.id,
            source: V2PositionSource.SYSTEM_TEMPLATE,
            name: template.name,
            code: template.code,
            description: template.description,
            sort: template.sort,
            createdBy: user.id,
            updatedBy: user.id
          }
        })
      ];
    });
    if (operations.length) await this.prisma.$transaction(operations);
    return this.listStorePositions(storeId);
  }

  listStorePositions(storeId: string) {
    return this.prisma.v2StorePosition.findMany({
      where: { storeId, deletedAt: null },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      include: { template: { select: { id: true, code: true, name: true } } }
    });
  }

  async createStorePosition(
    storeId: string,
    dto: CreateV2StorePositionDto,
    user: CurrentUser
  ) {
    const store = await this.prisma.v2Store.findFirst({
      where: { id: storeId, deletedAt: null, status: { not: 'CLOSED' } }
    });
    if (!store) throw new NotFoundException('门店不存在或已关闭');
    const { code: _requestedCode, ...data } = dto;
    const code = await this.nextCode(
      `STORE_POSITION:${storeId}`,
      `${store.code}-POS`
    );
    return this.prisma.v2StorePosition.create({
      data: {
        storeId,
        ...data,
        code,
        source: V2PositionSource.STORE_CUSTOM,
        createdBy: user.id,
        updatedBy: user.id
      }
    });
  }

  updateStorePosition(
    id: string,
    dto: UpdateV2StorePositionDto,
    user: CurrentUser
  ) {
    const { code: _code, ...data } = dto;
    return this.prisma.v2StorePosition.update({
      where: { id },
      data: { ...data, updatedBy: user.id }
    });
  }

  async deleteStorePosition(id: string, user: CurrentUser) {
    const activeEmployment = await this.prisma.v2Employment.count({
      where: { positionId: id, endedOn: null, deletedAt: null }
    });
    if (activeEmployment)
      throw new BadRequestException('岗位仍有关联在岗员工，不能删除');
    return this.prisma.v2StorePosition.update({
      where: { id },
      data: { enabled: false, deletedAt: new Date(), updatedBy: user.id }
    });
  }

  listEmployees(storeId?: string, organizationId?: string, user?: CurrentUser) {
    if (organizationId && !user?.roles.includes('super_admin'))
      throw new ForbiddenException('无权查看总部职能人员');
    if (
      storeId &&
      user &&
      !user.roles.includes('super_admin') &&
      !user.accessibleStoreIds.includes(storeId)
    )
      throw new ForbiddenException('无权查看该门店员工');
    const allowedStoreIds =
      user && !user.roles.includes('super_admin')
        ? user.accessibleStoreIds
        : undefined;
    const scopedIds = storeId ? [storeId] : allowedStoreIds;
    return this.prisma.v2Employee.findMany({
      where: {
        deletedAt: null,
        ...(organizationId
          ? {
              organizationEmployments: {
                some: {
                  organizationId,
                  endedOn: null,
                  deletedAt: null
                }
              }
            }
          : scopedIds
            ? {
                OR: [
                  {
                    employments: {
                      some: {
                        storeId: { in: scopedIds },
                        endedOn: null,
                        deletedAt: null
                      }
                    }
                  },
                  {
                    organizationEmployments: {
                      some: {
                        costStoreId: { in: scopedIds },
                        endedOn: null,
                        deletedAt: null
                      }
                    }
                  }
                ]
              }
            : {})
      },
      orderBy: { employeeNo: 'asc' },
      include: {
        employments: {
          where: {
            endedOn: null,
            deletedAt: null,
            store: { status: { not: 'CLOSED' }, deletedAt: null }
          },
          include: { store: true, position: true }
        },
        organizationEmployments: {
          where: { endedOn: null, deletedAt: null },
          include: { organization: true, position: true, costStore: true }
        }
      }
    });
  }

  async createEmployee(dto: CreateV2EmployeeDto, user: CurrentUser) {
    const isHeadOffice = Boolean(dto.organizationId);
    if (isHeadOffice && !user.roles.includes('super_admin'))
      throw new ForbiddenException('仅总部管理员可以新增总部人员');
    if (!isHeadOffice && !dto.storeId)
      throw new BadRequestException('请选择门店或总部组织');
    if (dto.storeId) this.assertStoreAccess(user, dto.storeId);
    const createLoginAccount = dto.createLoginAccount !== false;
    if (createLoginAccount && !dto.phone)
      throw new BadRequestException('自动开通登录账号时必须填写员工手机号');
    const position = isHeadOffice
      ? await this.prisma.v2OrganizationPosition.findFirst({
          where: {
            id: dto.organizationPositionId,
            organizationId: dto.organizationId,
            enabled: true,
            deletedAt: null
          }
        })
      : await this.prisma.v2StorePosition.findFirst({
          where: {
            id: dto.positionId,
            storeId: dto.storeId,
            enabled: true,
            deletedAt: null
          },
          include: { template: true }
        });
    if (!position) throw new BadRequestException('岗位不属于目标门店或已停用');
    const compensationType = dto.compensationType ?? 'MONTHLY';
    if (
      isHeadOffice &&
      'requiresPGrade' in position &&
      position.requiresPGrade
    ) {
      if (!dto.costStoreId)
        throw new BadRequestException('店长职能岗必须选择管理及成本归属门店');
      if (!/^P\d{1,2}$/i.test(dto.grade ?? ''))
        throw new BadRequestException('店长职能岗必须选择有效P等级');
      if (compensationType !== 'MONTHLY')
        throw new BadRequestException('店长职能岗仅支持月薪制');
      const costStore = await this.prisma.v2Store.findFirst({
        where: {
          id: dto.costStoreId,
          status: { not: 'CLOSED' },
          deletedAt: null
        }
      });
      if (!costStore) throw new BadRequestException('管理门店不存在或已关闭');
    }
    if (!isHeadOffice) {
      const storePosition = position as typeof position & {
        template: { hourlyRate: Prisma.Decimal } | null;
      };
      if (!storePosition.template)
        throw new BadRequestException('门店岗位必须来源于系统岗位模板');
      if (
        compensationType === 'HOURLY' &&
        Number(storePosition.template.hourlyRate) <= 0
      )
        throw new BadRequestException('该岗位尚未维护有效时薪');
    }
    const hiredOn = new Date(dto.hiredOn);
    const employeeNo = await this.nextCode(
      `EMPLOYEE:${hiredOn.getUTCFullYear()}`,
      `BC-${hiredOn.getUTCFullYear()}`
    );
    const mappedRoleId = isHeadOffice
      ? 'roleId' in position
        ? position.roleId
        : null
      : 'template' in position
        ? position.template?.roleId
        : null;
    const defaultRole =
      createLoginAccount && mappedRoleId
        ? await this.prisma.v2Role.findFirst({
            where: { id: mappedRoleId, enabled: true, deletedAt: null }
          })
        : null;
    const loginRoleIds = defaultRole ? [defaultRole.id] : [];
    const passwordHash = createLoginAccount
      ? await bcrypt.hash(dto.loginPassword || '123456', 12)
      : undefined;
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.v2Employee.create({
        data: {
          employeeNo,
          name: dto.name,
          phone: dto.phone,
          status: dto.status ?? 'ACTIVE',
          hiredOn,
          createdBy: user.id,
          updatedBy: user.id
        }
      });
      const employment = isHeadOffice
        ? await tx.v2OrganizationEmployment.create({
            data: {
              employeeId: employee.id,
              organizationId: dto.organizationId!,
              positionId: dto.organizationPositionId!,
              costStoreId: dto.costStoreId,
              grade: dto.grade,
              compensationType,
              startedOn: hiredOn,
              createdBy: user.id,
              updatedBy: user.id
            }
          })
        : await tx.v2Employment.create({
            data: {
              employeeId: employee.id,
              storeId: dto.storeId!,
              positionId: dto.positionId!,
              compensationType,
              startedOn: hiredOn,
              createdBy: user.id,
              updatedBy: user.id
            }
          });
      await tx.v2EmploymentHistory.create({
        data: {
          employeeId: employee.id,
          employmentId: isHeadOffice ? undefined : employment.id,
          changeType: 'HIRED',
          effectiveOn: hiredOn,
          afterData: {
            storeId: dto.storeId,
            positionId: dto.positionId,
            organizationId: dto.organizationId,
            organizationPositionId: dto.organizationPositionId,
            costStoreId: dto.costStoreId,
            grade: dto.grade,
            compensationType,
            status: dto.status ?? 'ACTIVE'
          },
          createdBy: user.id
        }
      });
      if (createLoginAccount) {
        await tx.v2Account.create({
          data: {
            employeeId: employee.id,
            username: dto.loginUsername || dto.phone!,
            passwordHash: passwordHash!,
            mustChangePassword: true,
            displayName: dto.name,
            dataScope: 'EMPLOYEE_STORE',
            createdBy: user.id,
            updatedBy: user.id,
            roles: {
              create: loginRoleIds.map((roleId) => ({
                roleId,
                createdBy: user.id
              }))
            }
          }
        });
      }
      return tx.v2Employee.findUnique({
        where: { id: employee.id },
        include: {
          employments: { include: { store: true, position: true } },
          organizationEmployments: {
            include: { organization: true, position: true, costStore: true }
          },
          changes: true
        }
      });
    });
  }

  async updateEmployee(
    employeeId: string,
    dto: UpdateV2EmployeeDto,
    user: CurrentUser
  ) {
    await this.assertEmployeeAccess(user, employeeId);
    const employee = await this.prisma.v2Employee.findFirst({
      where: { id: employeeId, deletedAt: null }
    });
    if (!employee) throw new NotFoundException('员工不存在');
    if (dto.grade && !/^P\d{1,2}$/i.test(dto.grade))
      throw new BadRequestException('店长必须选择有效P等级');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.v2Employee.update({
        where: { id: employeeId },
        data: {
          name: dto.name,
          phone: dto.phone,
          hiredOn: dto.hiredOn ? new Date(dto.hiredOn) : undefined,
          updatedBy: user.id
        }
      });
      if (dto.grade) {
        const managerEmployment = await tx.v2OrganizationEmployment.findFirst({
          where: {
            employeeId,
            endedOn: null,
            deletedAt: null,
            position: { requiresPGrade: true }
          }
        });
        if (!managerEmployment)
          throw new BadRequestException('该员工当前不是店长职能岗');
        const effectiveOn = new Date(
          dto.gradeEffectiveOn ?? new Date().toISOString().slice(0, 10)
        );
        const beforeGrade = managerEmployment.grade;
        await tx.v2OrganizationEmployment.update({
          where: { id: managerEmployment.id },
          data: { grade: dto.grade, updatedBy: user.id }
        });
        await tx.v2EmploymentHistory.create({
          data: {
            employeeId,
            changeType: 'POSITION_CHANGED',
            effectiveOn,
            beforeData: { grade: beforeGrade },
            afterData: { grade: dto.grade },
            reason: '店长P等级调整',
            createdBy: user.id
          }
        });
      }
      return updated;
    });
  }

  async listEmployeePayrollProfiles(month?: string) {
    const monthStart = /^\d{4}-\d{2}$/.test(month ?? '')
      ? new Date(`${month}-01T00:00:00.000Z`)
      : new Date();
    const monthEnd = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)
    );
    const [employees, profiles, templates] = await Promise.all([
      this.prisma.v2Employee.findMany({
        where: { deletedAt: null, status: { not: 'TERMINATED' } },
        select: {
          id: true,
          hiredOn: true,
          employments: {
            where: {
              endedOn: null,
              deletedAt: null,
              store: { status: { not: 'CLOSED' }, deletedAt: null }
            },
            select: { position: { select: { name: true } } }
          },
          organizationEmployments: {
            where: { endedOn: null, deletedAt: null },
            select: { position: { select: { name: true } } }
          }
        }
      }),
      this.prisma.v2EmployeePayrollProfile.findMany({
        where: {
          effectiveFrom: { lte: monthEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }],
          employee: { deletedAt: null, status: { not: 'TERMINATED' } }
        },
        orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }]
      }),
      this.prisma.v2PayrollProfileTemplate.findMany({
        where: { enabled: true },
        orderBy: [{ sort: 'asc' }, { name: 'asc' }]
      })
    ]);
    const personal = new Map<string, (typeof profiles)[number]>();
    profiles.forEach((profile) => {
      if (!personal.has(profile.employeeId))
        personal.set(profile.employeeId, profile);
    });
    const resolved: Array<Record<string, unknown>> = [];
    for (const employee of employees) {
      const own = personal.get(employee.id);
      if (own) {
        resolved.push({
          ...own,
          source: 'PERSONAL',
          confirmed: true,
          templateId: null,
          templateName: null
        });
        continue;
      }
      const positionNames = [
        ...employee.employments.map((item) => item.position.name),
        ...employee.organizationEmployments.map((item) => item.position.name)
      ];
      const employeeType = positionNames.some((name) => name.includes('店长'))
        ? 'STORE_MANAGER'
        : positionNames.some((name) => name.includes('总部'))
          ? 'HEAD_OFFICE'
          : 'STORE_STAFF';
      const template =
        templates.find(
          (item) =>
            item.employeeType === employeeType &&
            item.positionKeyword &&
            positionNames.some((name) => name.includes(item.positionKeyword!))
        ) ??
        templates.find(
          (item) => item.employeeType === employeeType && item.isDefault
        );
      if (!template) continue;
      const {
        id: templateId,
        name: templateName,
        code: _code,
        isDefault: _isDefault,
        positionKeyword: _positionKeyword,
        enabled: _enabled,
        sort: _sort,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        createdBy: _createdBy,
        updatedBy: _updatedBy,
        ...values
      } = template;
      resolved.push({
        ...values,
        id: `template:${templateId}:${employee.id}`,
        employeeId: employee.id,
        effectiveFrom: employee.hiredOn ?? monthStart,
        effectiveTo: null,
        reason: '系统按岗位匹配薪资模板，待人工确认',
        source: 'TEMPLATE',
        confirmed: false,
        templateId,
        templateName
      });
    }
    return resolved;
  }

  listPayrollProfileTemplates() {
    return this.prisma.v2PayrollProfileTemplate.findMany({
      where: { enabled: true },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }]
    });
  }

  async createPayrollGrade(dto: CreateV2PayrollGradeDto, user: CurrentUser) {
    this.validatePayrollGrade(dto.employeeType, dto.grade, dto.category);
    const code = await this.nextCode('PAYROLL_GRADE', 'GRADE');
    return this.prisma.v2PayrollProfileTemplate.create({
      data: { ...dto, code, createdBy: user.id, updatedBy: user.id }
    });
  }

  updatePayrollGrade(
    id: string,
    dto: UpdateV2PayrollGradeDto,
    user: CurrentUser
  ) {
    if (dto.employeeType && dto.grade)
      this.validatePayrollGrade(dto.employeeType, dto.grade, dto.category);
    return this.prisma.v2PayrollProfileTemplate.update({
      where: { id },
      data: { ...dto, updatedBy: user.id }
    });
  }

  private validatePayrollGrade(
    employeeType: string,
    grade: string,
    category?: string
  ) {
    if (employeeType === 'STORE_MANAGER' && !/^P\d{1,2}$/i.test(grade))
      throw new BadRequestException('店长职级编码须使用P加数字，例如P5');
    if (
      employeeType === 'HEAD_OFFICE' &&
      (!/^M\d{1,2}$/i.test(grade) || !category)
    )
      throw new BadRequestException('总部职级须使用M加数字并选择岗位类别');
  }

  async createEmployeePayrollProfile(
    employeeId: string,
    dto: CreateV2EmployeePayrollProfileDto,
    user: CurrentUser
  ) {
    const employee = await this.prisma.v2Employee.findFirst({
      where: { id: employeeId, deletedAt: null, status: { not: 'TERMINATED' } }
    });
    if (!employee) throw new NotFoundException('员工不存在或已离职');
    if (
      dto.employeeType === 'STORE_MANAGER' &&
      !/^P\d{1,2}$/i.test(dto.grade ?? '')
    )
      throw new BadRequestException('店长薪资身份必须设置P0-P4等级');
    if (
      dto.employeeType === 'HEAD_OFFICE' &&
      (!/^M\d{1,2}$/i.test(dto.grade ?? '') || !dto.category)
    )
      throw new BadRequestException('总部薪资身份必须设置M0-M6等级和岗位类别');
    const effectiveFrom = new Date(dto.effectiveFrom);
    const previousDay = new Date(effectiveFrom);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    return this.prisma.$transaction(async (tx) => {
      await tx.v2EmployeePayrollProfile.updateMany({
        where: {
          employeeId,
          effectiveFrom: { lt: effectiveFrom },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }]
        },
        data: { effectiveTo: previousDay, updatedBy: user.id }
      });
      return tx.v2EmployeePayrollProfile.create({
        data: {
          employeeId,
          ...dto,
          effectiveFrom,
          createdBy: user.id,
          updatedBy: user.id
        }
      });
    });
  }

  async changeEmployment(
    employeeId: string,
    dto: ChangeV2EmploymentDto,
    user: CurrentUser
  ) {
    this.assertStoreAccess(user, dto.storeId);
    const effectiveOn = new Date(dto.effectiveOn);
    const [employee, current, nextPosition] = await Promise.all([
      this.prisma.v2Employee.findFirst({
        where: { id: employeeId, deletedAt: null }
      }),
      this.prisma.v2Employment.findFirst({
        where: { employeeId, endedOn: null, deletedAt: null, isPrimary: true },
        orderBy: { startedOn: 'desc' }
      }),
      this.prisma.v2StorePosition.findFirst({
        where: {
          id: dto.positionId,
          storeId: dto.storeId,
          enabled: true,
          deletedAt: null
        }
      })
    ]);
    if (!employee) throw new NotFoundException('员工不存在');
    if (!current) throw new BadRequestException('员工没有有效的主任职关系');
    if (!nextPosition)
      throw new BadRequestException('目标岗位不属于目标门店或已停用');
    if (
      current.storeId === dto.storeId &&
      current.positionId === dto.positionId
    ) {
      throw new BadRequestException('目标门店和岗位与当前任职相同');
    }
    const changeType =
      current.storeId === dto.storeId ? 'POSITION_CHANGED' : 'TRANSFERRED';
    return this.prisma.$transaction(async (tx) => {
      await tx.v2Employment.update({
        where: { id: current.id },
        data: { endedOn: effectiveOn, updatedBy: user.id }
      });
      const next = await tx.v2Employment.create({
        data: {
          employeeId,
          storeId: dto.storeId,
          positionId: dto.positionId,
          startedOn: effectiveOn,
          createdBy: user.id,
          updatedBy: user.id
        }
      });
      await tx.v2EmploymentHistory.create({
        data: {
          employeeId,
          employmentId: next.id,
          changeType,
          effectiveOn,
          beforeData: {
            storeId: current.storeId,
            positionId: current.positionId,
            employmentId: current.id
          },
          afterData: {
            storeId: dto.storeId,
            positionId: dto.positionId,
            employmentId: next.id
          },
          reason: dto.reason,
          createdBy: user.id
        }
      });
      await this.syncEmployeePositionRole(tx, employeeId, user.id);
      return next;
    });
  }

  async addEmployment(
    employeeId: string,
    dto: ChangeV2EmploymentDto,
    user: CurrentUser
  ) {
    this.assertStoreAccess(user, dto.storeId);
    const employee = await this.prisma.v2Employee.findFirst({
      where: { id: employeeId, deletedAt: null, status: { not: 'TERMINATED' } }
    });
    if (!employee) throw new NotFoundException('员工不存在或已离职');
    const position = await this.prisma.v2StorePosition.findFirst({
      where: {
        id: dto.positionId,
        storeId: dto.storeId,
        enabled: true,
        deletedAt: null
      }
    });
    if (!position) throw new BadRequestException('岗位不属于所选门店');
    const existing = await this.prisma.v2Employment.findFirst({
      where: {
        employeeId,
        storeId: dto.storeId,
        endedOn: null,
        deletedAt: null
      }
    });
    if (existing) throw new BadRequestException('员工已在该门店任职');
    return this.prisma.$transaction(async (tx) => {
      const employment = await tx.v2Employment.create({
        data: {
          employeeId,
          storeId: dto.storeId,
          positionId: dto.positionId,
          startedOn: new Date(dto.effectiveOn),
          isPrimary: false,
          createdBy: user.id,
          updatedBy: user.id
        }
      });
      await tx.v2EmploymentHistory.create({
        data: {
          employeeId,
          employmentId: employment.id,
          changeType: 'HIRED',
          effectiveOn: new Date(dto.effectiveOn),
          afterData: {
            storeId: dto.storeId,
            positionId: dto.positionId,
            isPrimary: false
          },
          reason: dto.reason || '多店兼任',
          createdBy: user.id
        }
      });
      await this.syncEmployeePositionRole(tx, employeeId, user.id);
      return employment;
    });
  }

  async changeManagerStore(
    employeeId: string,
    dto: ChangeV2ManagerStoreDto,
    user: CurrentUser
  ) {
    const [employment, store] = await Promise.all([
      this.prisma.v2OrganizationEmployment.findFirst({
        where: {
          employeeId,
          endedOn: null,
          deletedAt: null,
          position: { requiresPGrade: true }
        }
      }),
      this.prisma.v2Store.findFirst({
        where: {
          id: dto.managedStoreId,
          status: { not: 'CLOSED' },
          deletedAt: null
        }
      })
    ]);
    if (!employment) throw new BadRequestException('该员工当前不是店长职能岗');
    if (!store) throw new BadRequestException('目标管理门店不存在或已关闭');
    if (employment.costStoreId === dto.managedStoreId)
      throw new BadRequestException('目标门店与当前管理门店相同');
    const effectiveOn = new Date(dto.effectiveOn);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.v2OrganizationEmployment.update({
        where: { id: employment.id },
        data: { costStoreId: dto.managedStoreId, updatedBy: user.id }
      });
      await tx.v2EmploymentHistory.create({
        data: {
          employeeId,
          changeType: 'TRANSFERRED',
          effectiveOn,
          beforeData: { managedStoreId: employment.costStoreId },
          afterData: { managedStoreId: dto.managedStoreId },
          reason: dto.reason || '店长调整管理门店',
          createdBy: user.id
        }
      });
      await this.syncEmployeePositionRole(tx, employeeId, user.id);
      return updated;
    });
  }

  async terminateEmployee(
    employeeId: string,
    dto: TerminateV2EmployeeDto,
    user: CurrentUser
  ) {
    await this.assertEmployeeAccess(user, employeeId);
    const effectiveOn = new Date(dto.effectiveOn);
    const employee = await this.prisma.v2Employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      include: {
        employments: { where: { endedOn: null, deletedAt: null } },
        organizationEmployments: {
          where: { endedOn: null, deletedAt: null }
        }
      }
    });
    if (!employee) throw new NotFoundException('员工不存在');
    if (employee.status === 'TERMINATED')
      throw new BadRequestException('员工已经离职');
    return this.prisma.$transaction(async (tx) => {
      await tx.v2Employment.updateMany({
        where: { employeeId, endedOn: null, deletedAt: null },
        data: { endedOn: effectiveOn, updatedBy: user.id }
      });
      await tx.v2OrganizationEmployment.updateMany({
        where: { employeeId, endedOn: null, deletedAt: null },
        data: { endedOn: effectiveOn, updatedBy: user.id }
      });
      const updated = await tx.v2Employee.update({
        where: { id: employeeId },
        data: {
          status: 'TERMINATED',
          terminatedOn: effectiveOn,
          updatedBy: user.id
        }
      });
      await tx.v2Account.updateMany({
        where: { employeeId, deletedAt: null },
        data: { status: 'DISABLED', updatedBy: user.id }
      });
      await tx.v2EmploymentHistory.create({
        data: {
          employeeId,
          changeType: 'TERMINATED',
          effectiveOn,
          beforeData: {
            status: employee.status,
            activeEmploymentIds: [
              ...employee.employments.map((item) => item.id),
              ...employee.organizationEmployments.map((item) => item.id)
            ]
          },
          afterData: { status: 'TERMINATED' },
          reason: dto.reason,
          createdBy: user.id
        }
      });
      return updated;
    });
  }

  async createEmployeeLeave(
    employeeId: string,
    dto: CreateV2EmployeeLeaveDto,
    user: CurrentUser
  ) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt)
      throw new BadRequestException('请假结束时间必须晚于开始时间');
    const employment = await this.prisma.v2Employment.findFirst({
      where: {
        employeeId,
        storeId: dto.storeId,
        endedOn: null,
        deletedAt: null
      }
    });
    if (!employment) throw new BadRequestException('员工当前不属于目标门店');
    const overlap = await this.prisma.v2EmployeeLeave.findFirst({
      where: {
        employeeId,
        deletedAt: null,
        status: { in: [V2LeaveStatus.PENDING, V2LeaveStatus.APPROVED] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt }
      }
    });
    if (overlap) throw new BadRequestException('员工在该时间段已有请假记录');
    return this.prisma.v2EmployeeLeave.create({
      data: {
        employeeId,
        storeId: dto.storeId,
        type: dto.type,
        startsAt,
        endsAt,
        reason: dto.reason,
        createdBy: user.id,
        updatedBy: user.id
      }
    });
  }

  async resetEmployeePassword(employeeId: string, user: CurrentUser) {
    await this.assertEmployeeAccess(user, employeeId);
    const account = await this.prisma.v2Account.findFirst({
      where: { employeeId, deletedAt: null }
    });
    if (!account) throw new NotFoundException('该员工尚未开通登录账号');
    await this.prisma.v2Account.update({
      where: { id: account.id },
      data: {
        passwordHash: await bcrypt.hash('123456', 12),
        mustChangePassword: true,
        status: 'ACTIVE',
        updatedBy: user.id
      }
    });
    return { success: true, initialPassword: '123456' };
  }

  reviewEmployeeLeave(id: string, status: V2LeaveStatus, user: CurrentUser) {
    const reviewableStatuses = new Set<V2LeaveStatus>([
      V2LeaveStatus.APPROVED,
      V2LeaveStatus.REJECTED,
      V2LeaveStatus.CANCELLED
    ]);
    if (!reviewableStatuses.has(status)) {
      throw new BadRequestException('请假审核状态无效');
    }
    return this.prisma.v2EmployeeLeave.update({
      where: { id },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedBy: user.id,
        updatedBy: user.id
      }
    });
  }

  listStoreArchive(storeId: string, costMonthValue?: string) {
    const costMonth = /^\d{4}-\d{2}$/.test(costMonthValue ?? '')
      ? costMonthValue!
      : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }).slice(0, 7);
    const costMonthStart = new Date(`${costMonth}-01T00:00:00.000Z`);
    const costMonthEnd = new Date(costMonthStart);
    costMonthEnd.setUTCMonth(costMonthEnd.getUTCMonth() + 1);
    return Promise.all([
      this.prisma.v2Store.findFirst({
        where: { id: storeId, deletedAt: null },
        include: {
          operatingProfile: true,
          organization: { select: { id: true, name: true, code: true } }
        }
      }),
      this.prisma.v2StoreCostConfig.findMany({
        where: {
          storeId,
          enabled: true,
          deletedAt: null,
          effectiveFrom: { lt: costMonthEnd },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: costMonthStart } }
          ]
        },
        orderBy: [{ effectiveFrom: 'asc' }]
      }),
      this.prisma.v2StoreCostCorrection.findMany({
        where: { storeId, costMonth: costMonthStart }
      }),
      this.prisma.v2StoreInvestment.findMany({
        where: { storeId, deletedAt: null },
        orderBy: { occurredOn: 'desc' }
      }),
      this.prisma.v2StoreAsset.findMany({
        where: { storeId, deletedAt: null },
        include: { area: { select: { id: true, name: true, code: true } } },
        orderBy: [{ category: 'asc' }, { assetNo: 'asc' }]
      }),
      this.prisma.v2StoreArea.findMany({
        where: { storeId, deletedAt: null },
        orderBy: [{ sort: 'asc' }, { name: 'asc' }]
      }),
      this.prisma.v2StorePosition.findMany({
        where: { storeId, deletedAt: null },
        include: { template: { select: { id: true, name: true, code: true } } },
        orderBy: [{ sort: 'asc' }, { name: 'asc' }]
      }),
      this.prisma.v2Employment.findMany({
        where: { storeId, endedOn: null, deletedAt: null },
        include: {
          employee: {
            select: {
              id: true,
              employeeNo: true,
              name: true,
              phone: true,
              status: true
            }
          },
          position: { select: { id: true, name: true, code: true } }
        },
        orderBy: { startedOn: 'asc' }
      })
    ]).then(
      ([store, costVersions, corrections, investments, assets, areas, positions, employments]) => {
        if (!store) throw new NotFoundException('V2 门店不存在');
        const latest = new Map<string, (typeof costVersions)[number]>();
        for (const item of costVersions) latest.set(item.code, item);
        const correctionMap = new Map(corrections.map((item) => [item.code, item]));
        const costs = [...latest.values()]
          .map((item) => {
            const correction = correctionMap.get(item.code);
            return correction
              ? { ...item, ...correction, id: item.id, correctionId: correction.id, corrected: true }
              : { ...item, correctionId: null, corrected: false };
          })
        for (const correction of corrections) {
          if (latest.has(correction.code)) continue;
          costs.push({
            ...correction,
            id: correction.id,
            templateId: null,
            effectiveFrom: costMonthStart,
            effectiveTo: new Date(costMonthEnd.getTime() - 86400000),
            historicalBaseline: false,
            enabled: true,
            deletedAt: null,
            correctionId: correction.id,
            corrected: true
          });
        }
        costs.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
        return {
          store,
          costMonth,
          costs,
          investments,
          assets,
          areas,
          positions,
          employments
        };
      }
    );
  }

  upsertOperatingProfile(
    storeId: string,
    dto: UpsertV2OperatingProfileDto,
    user: CurrentUser
  ) {
    const data = {
      legalEntityName: dto.legalEntityName,
      usableAreaSqm: dto.usableAreaSqm,
      seatCount: dto.seatCount,
      leaseStartsOn: dto.leaseStartsOn
        ? new Date(dto.leaseStartsOn)
        : undefined,
      leaseEndsOn: dto.leaseEndsOn ? new Date(dto.leaseEndsOn) : undefined,
      notes: dto.notes,
      updatedBy: user.id
    };
    return this.prisma.v2StoreOperatingProfile.upsert({
      where: { storeId },
      update: data,
      create: { storeId, ...data, createdBy: user.id }
    });
  }

  createStoreCost(
    storeId: string,
    dto: CreateV2StoreCostDto,
    user: CurrentUser
  ) {
    if (dto.method === 'RATE' && dto.rate === undefined)
      throw new BadRequestException('请填写营业额计提比例');
    if (dto.method === 'FIXED' && dto.fixedAmount === undefined)
      throw new BadRequestException('请填写固定金额');
    const effectiveFrom = this.currentCostMonthStart();
    const data = {
      ...dto,
      fixedAmount: dto.method === 'FIXED' ? dto.fixedAmount : null,
      rate: dto.method === 'RATE' ? dto.rate : null,
      effectiveFrom,
      effectiveTo: null,
      historicalBaseline: false,
      enabled: true,
      deletedAt: null,
      updatedBy: user.id
    };
    return this.prisma.v2StoreCostConfig.upsert({
      where: {
        storeId_code_effectiveFrom: { storeId, code: dto.code, effectiveFrom }
      },
      update: data,
      create: { storeId, ...data, createdBy: user.id }
    });
  }

  async correctStoreCost(
    storeId: string,
    dto: CorrectV2StoreCostDto,
    user: CurrentUser
  ) {
    this.assertStoreAccess(user, storeId);
    const costMonth = new Date(`${dto.targetMonth}-01T00:00:00.000Z`);
    if (costMonth >= this.currentCostMonthStart())
      throw new BadRequestException('历史成本修正仅适用于当前月份之前的数据');
    if (dto.method === 'RATE' && dto.rate === undefined)
      throw new BadRequestException('请填写营业额计提比例');
    if (dto.method === 'FIXED' && dto.fixedAmount === undefined)
      throw new BadRequestException('请填写固定金额');
    if (dto.sourceConfigId) {
      const source = await this.prisma.v2StoreCostConfig.findFirst({
        where: { id: dto.sourceConfigId, storeId, code: dto.code }
      });
      if (!source) throw new BadRequestException('原成本配置不存在或不属于当前门店');
    }
    const data = {
      sourceConfigId: dto.sourceConfigId,
      name: dto.name,
      category: dto.category,
      method: dto.method,
      frequency: dto.method === 'RATE' ? V2CostFrequency.MONTHLY : dto.frequency,
      fixedAmount: dto.method === 'FIXED' ? dto.fixedAmount : null,
      rate: dto.method === 'RATE' ? dto.rate : null,
      formula: dto.formula,
      reason: dto.reason.trim(),
      updatedBy: user.id
    };
    return this.prisma.v2StoreCostCorrection.upsert({
      where: {
        storeId_code_costMonth: { storeId, code: dto.code, costMonth }
      },
      update: data,
      create: {
        storeId,
        code: dto.code,
        costMonth,
        ...data,
        createdBy: user.id
      }
    });
  }

  async updateStoreCost(
    id: string,
    dto: UpdateV2StoreCostDto,
    user: CurrentUser
  ) {
    const existing = await this.prisma.v2StoreCostConfig.findUnique({
      where: { id }
    });
    if (!existing) throw new BadRequestException('成本项不存在');
    const monthStart = this.currentCostMonthStart();
    const merged = { ...existing, ...dto };
    if (merged.method === 'RATE' && merged.rate == null)
      throw new BadRequestException('请填写营业额计提比例');
    if (merged.method === 'FIXED' && merged.fixedAmount == null)
      throw new BadRequestException('请填写固定金额');
    const data = {
      templateId: merged.templateId,
      name: merged.name,
      code: merged.code,
      category: merged.category,
      method: merged.method,
      frequency: merged.frequency,
      fixedAmount: merged.method === 'FIXED' ? merged.fixedAmount : null,
      rate: merged.method === 'RATE' ? merged.rate : null,
      formula: merged.formula,
      effectiveTo: null,
      enabled: true,
      deletedAt: null,
      updatedBy: user.id
    };
    if (existing.effectiveFrom >= monthStart && !existing.historicalBaseline)
      return this.prisma.v2StoreCostConfig.update({ where: { id }, data });
    const previousMonthEnd = new Date(monthStart.getTime() - 86400000);
    return this.prisma.$transaction(async (tx) => {
      await tx.v2StoreCostConfig.update({
        where: { id },
        data: { effectiveTo: previousMonthEnd, updatedBy: user.id }
      });
      return tx.v2StoreCostConfig.upsert({
        where: {
          storeId_code_effectiveFrom: {
            storeId: existing.storeId,
            code: merged.code,
            effectiveFrom: monthStart
          }
        },
        update: data,
        create: {
          storeId: existing.storeId,
          ...data,
          effectiveFrom: monthStart,
          historicalBaseline: false,
          createdBy: user.id
        }
      });
    });
  }
  async deleteStoreCost(id: string, user: CurrentUser) {
    const existing = await this.prisma.v2StoreCostConfig.findUnique({
      where: { id }
    });
    if (!existing) throw new BadRequestException('成本项不存在');
    const monthStart = this.currentCostMonthStart();
    if (existing.effectiveFrom >= monthStart && !existing.historicalBaseline)
      return this.prisma.v2StoreCostConfig.update({
        where: { id },
        data: { enabled: false, deletedAt: new Date(), updatedBy: user.id }
      });
    return this.prisma.v2StoreCostConfig.update({
      where: { id },
      data: {
        effectiveTo: new Date(monthStart.getTime() - 86400000),
        updatedBy: user.id
      }
    });
  }

  private currentCostMonthStart() {
    const month = new Date()
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
      .slice(0, 7);
    // Prisma DATE fields must use a UTC calendar date. Using +08:00 here
    // serializes the first day as the previous UTC day (for example 10/01 ->
    // 09/30), which makes two monthly cost versions overlap in September.
    return new Date(`${month}-01T00:00:00.000Z`);
  }

  createStoreInvestment(
    storeId: string,
    dto: CreateV2StoreInvestmentDto,
    user: CurrentUser
  ) {
    return this.prisma.v2StoreInvestment.create({
      data: {
        storeId,
        ...dto,
        occurredOn: new Date(dto.occurredOn),
        createdBy: user.id,
        updatedBy: user.id
      }
    });
  }

  updateStoreInvestment(
    id: string,
    dto: UpdateV2StoreInvestmentDto,
    user: CurrentUser
  ) {
    const { occurredOn, ...data } = dto;
    return this.prisma.v2StoreInvestment.update({
      where: { id },
      data: {
        ...data,
        occurredOn: occurredOn ? new Date(occurredOn) : undefined,
        updatedBy: user.id
      }
    });
  }
  deleteStoreInvestment(id: string, user: CurrentUser) {
    return this.prisma.v2StoreInvestment.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: user.id }
    });
  }

  createStoreAsset(
    storeId: string,
    dto: CreateV2StoreAssetDto,
    user: CurrentUser
  ) {
    return this.prisma.v2StoreAsset.create({
      data: {
        storeId,
        ...dto,
        purchasedOn: dto.purchasedOn ? new Date(dto.purchasedOn) : undefined,
        createdBy: user.id,
        updatedBy: user.id
      }
    });
  }

  updateStoreAsset(id: string, dto: UpdateV2StoreAssetDto, user: CurrentUser) {
    const { purchasedOn, ...data } = dto;
    return this.prisma.v2StoreAsset.update({
      where: { id },
      data: {
        ...data,
        purchasedOn: purchasedOn ? new Date(purchasedOn) : undefined,
        updatedBy: user.id
      }
    });
  }
  deleteStoreAsset(id: string, user: CurrentUser) {
    return this.prisma.v2StoreAsset.update({
      where: { id },
      data: { status: 'DISPOSED', deletedAt: new Date(), updatedBy: user.id }
    });
  }

  createStoreArea(
    storeId: string,
    dto: CreateV2StoreAreaDto,
    user: CurrentUser
  ) {
    return this.prisma.v2StoreArea.create({
      data: { storeId, ...dto, createdBy: user.id, updatedBy: user.id }
    });
  }

  updateStoreArea(id: string, dto: UpdateV2StoreAreaDto, user: CurrentUser) {
    return this.prisma.v2StoreArea.update({
      where: { id },
      data: { ...dto, updatedBy: user.id }
    });
  }
  async deleteStoreArea(id: string, user: CurrentUser) {
    const assets = await this.prisma.v2StoreAsset.count({
      where: { areaId: id, deletedAt: null }
    });
    if (assets)
      throw new BadRequestException('区域下仍有设备，请先调整设备区域');
    return this.prisma.v2StoreArea.update({
      where: { id },
      data: { enabled: false, deletedAt: new Date(), updatedBy: user.id }
    });
  }

  listAccessControl() {
    return Promise.all([
      this.prisma.v2Account.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          username: true,
          displayName: true,
          status: true,
          dataScope: true,
          employee: { select: { id: true, name: true, employeeNo: true } },
          roles: { include: { role: true } },
          storeScopes: {
            include: { store: { select: { id: true, name: true } } }
          }
        },
        orderBy: { username: 'asc' }
      }),
      this.prisma.v2Role.findMany({
        where: { deletedAt: null },
        include: { permissions: { include: { permission: true } } },
        orderBy: { name: 'asc' }
      }),
      this.prisma.v2Permission.findMany({
        orderBy: [{ module: 'asc' }, { code: 'asc' }]
      })
    ]).then(([accounts, roles, permissions]) => ({
      accounts,
      roles,
      permissions
    }));
  }

  async listLoginUsers() {
    const [legacyUsers, accounts, lastLogs] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          username: true,
          nickname: true,
          enabled: true,
          employee: { select: { id: true, name: true, employeeNo: true } },
          roles: { select: { role: { select: { name: true, code: true } } } },
          storeId: true
        },
        orderBy: { username: 'asc' }
      }),
      this.prisma.v2Account.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          username: true,
          displayName: true,
          status: true,
          dataScope: true,
          lastLoginAt: true,
          employee: {
            select: {
              id: true,
              name: true,
              employeeNo: true,
              employments: {
                where: { endedOn: null, deletedAt: null },
                select: {
                  store: { select: { id: true, name: true, shortName: true } }
                }
              }
            }
          },
          roles: { select: { role: { select: { name: true, code: true } } } },
          storeScopes: {
            select: {
              store: { select: { id: true, name: true, shortName: true } }
            }
          }
        },
        orderBy: { username: 'asc' }
      }),
      this.prisma.loginLog.groupBy({
        by: ['accountType', 'accountId'],
        _max: { loggedInAt: true }
      })
    ]);
    const lastLoginMap = new Map(
      lastLogs.map((item) => [
        `${item.accountType}:${item.accountId}`,
        item._max.loggedInAt
      ])
    );
    const items = [
      ...legacyUsers.map((item) => ({
        id: item.id,
        accountType: 'LEGACY_USER',
        username: item.username,
        displayName: item.nickname,
        status: item.enabled ? 'ACTIVE' : 'DISABLED',
        dataScope: item.roles.some((link) => link.role.code === 'super_admin')
          ? 'ALL_STORES'
          : 'LEGACY_STORE',
        employee: item.employee,
        roles: item.roles.map((link) => link.role),
        stores: [],
        lastLoginAt: lastLoginMap.get(`LEGACY_USER:${item.id}`) ?? null
      })),
      ...accounts.map((item) => ({
        id: item.id,
        accountType: 'V2_ACCOUNT',
        username: item.username,
        displayName: item.displayName,
        status: item.status,
        dataScope: item.dataScope,
        employee: item.employee
          ? {
              id: item.employee.id,
              name: item.employee.name,
              employeeNo: item.employee.employeeNo
            }
          : null,
        roles: item.roles.map((link) => link.role),
        stores:
          item.dataScope === 'ASSIGNED_STORES'
            ? item.storeScopes.map((link) => link.store)
            : (item.employee?.employments.map((link) => link.store) ?? []),
        lastLoginAt:
          lastLoginMap.get(`V2_ACCOUNT:${item.id}`) ?? item.lastLoginAt
      }))
    ];
    return items.sort((a, b) => {
      if (!a.lastLoginAt) return 1;
      if (!b.lastLoginAt) return -1;
      return b.lastLoginAt.getTime() - a.lastLoginAt.getTime();
    });
  }

  async listLoginLogs(
    accountType: string,
    accountId: string,
    page: number,
    pageSize: number
  ) {
    if (!['LEGACY_USER', 'V2_ACCOUNT'].includes(accountType))
      throw new BadRequestException('账号类型无效');
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(10, pageSize));
    const where = { accountType, accountId };
    const [items, total] = await Promise.all([
      this.prisma.loginLog.findMany({
        where,
        orderBy: { loggedInAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize
      }),
      this.prisma.loginLog.count({ where })
    ]);
    return { items, total, page: safePage, pageSize: safePageSize };
  }

  async isLiveSuperAdmin(id: string) {
    const v2 = await this.prisma.v2Account.findUnique({
      where: { id },
      select: {
        status: true, deletedAt: true, mustChangePassword: true,
        employee: { select: { status: true, deletedAt: true } },
        roles: {
          where: { role: { code: 'super_admin', enabled: true, deletedAt: null } },
          select: { roleId: true }
        }
      }
    });
    if (v2) {
      return v2.status === 'ACTIVE' && !v2.deletedAt && !v2.mustChangePassword &&
        (!v2.employee || (v2.employee.status === 'ACTIVE' && !v2.employee.deletedAt)) &&
        v2.roles.length > 0;
    }
    return Boolean(await this.prisma.user.findFirst({
      where: { id, enabled: true, deletedAt: null, roles: { some: { role: { code: 'super_admin', deletedAt: null } } } },
      select: { id: true }
    }));
  }

  async previewScopedPermissions(id: string) {
    return this.prisma.$transaction(async tx => {
      const account = await tx.v2Account.findFirst({
        where: { id, deletedAt: null },
        select: { displayName: true, status: true, dataScope: true, mustChangePassword: true }
      });
      if (!account) throw new NotFoundException('V2 账号不存在');
      const permissions = await tx.v2Permission.findMany({
        where: { module: { in: ['attendance', 'operational-task'] } },
        select: { code: true, name: true }, orderBy: { code: 'asc' }
      });
      const stores = await tx.v2Store.findMany({
        where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' }
      });
      const rows = [];
      for (const permission of permissions) {
        const access = await resolveScopedPermission(id, permission.code, tx);
        rows.push({
          ...permission, allowed: Boolean(access), allStores: access?.storeIds === null,
          stores: access?.storeIds ? stores.filter(store => access.storeIds?.includes(store.id)) : []
        });
      }
      return { ...account, rows };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async rolePermissionAudit(roleId: string) {
    const rows = await this.prisma.v2RolePermissionAudit.findMany({
      where: { roleId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30
    });
    const ids = [...new Set(rows.map(row => row.actorId))];
    const [accounts, legacy] = await Promise.all([
      this.prisma.v2Account.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }),
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, nickname: true } })
    ]);
    const names = new Map([...legacy.map(actor => [actor.id, actor.nickname] as const),
      ...accounts.map(actor => [actor.id, actor.displayName] as const)]);
    return rows.map(row => ({ ...row, actorName: names.get(row.actorId) ?? '历史管理员' }));
  }

  async createRole(dto: CreateV2RoleDto, actorId: string) {
    const { permissionCodes = [], code: _requestedCode, ...roleData } = dto;
    const code = await this.nextCode('ROLE', 'ROLE');
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.v2Role.create({ data: { ...roleData, code } });
      const permissions = await tx.v2Permission.findMany({
        where: { code: { in: permissionCodes } }, select: { id: true, code: true }
      });
      if (permissions.length !== new Set(permissionCodes).size)
        throw new BadRequestException('包含无效的权限项，请刷新后重试');
      if (permissions.length) await tx.v2RolePermission.createMany({
        data: permissions.map(permission => ({ roleId: role.id, permissionId: permission.id }))
      });
      await tx.v2RolePermissionAudit.create({
        data: { roleId: role.id, actorId, beforeCodes: [], afterCodes: permissions.map(item => item.code).sort() }
      });
      return role;
    });
  }

  async updateRole(id: string, dto: CreateV2RoleDto, actorId: string) {
    const existing = await this.prisma.v2Role.findFirst({
      where: { id, deletedAt: null }
    });
    if (!existing) throw new NotFoundException('角色不存在');
    if (existing.code === 'super_admin')
      throw new ForbiddenException('超级管理员角色受系统保护，不允许修改');
    const { permissionCodes = [], code: _ignoredCode, ...roleData } = dto;
    const permissions = await this.prisma.v2Permission.findMany({
      where: { code: { in: permissionCodes } },
      select: { id: true, code: true }
    });
    if (permissions.length !== new Set(permissionCodes).size)
      throw new BadRequestException('包含无效的权限项，请刷新后重试');
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.v2Role.update({
        where: { id },
        data: {
          name: roleData.name,
          description: roleData.description
        }
      });
      const before = await tx.v2RolePermission.findMany({
        where: { roleId: id }, select: { permission: { select: { code: true } } }
      });
      const beforeCodes = before.map(item => item.permission.code).sort();
      const afterCodes = permissions.map(item => item.code).sort();
      if (JSON.stringify(beforeCodes) === JSON.stringify(afterCodes)) return role;
      await tx.v2RolePermission.deleteMany({ where: { roleId: id } });
      if (permissions.length)
        await tx.v2RolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: id,
            permissionId: permission.id
          }))
        });
      await tx.v2RolePermissionAudit.create({ data: { roleId: id, actorId, beforeCodes, afterCodes } });
      return role;
    });
  }

  async authorizationAudit() {
    const rows = await this.prisma.v2AuthorizationAudit.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50
    });
    const ids = [...new Set(rows.map(row => row.actorId))];
    const [accounts, users] = await Promise.all([
      this.prisma.v2Account.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }),
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, nickname: true } })
    ]);
    const names = new Map([...users.map(row => [row.id, row.nickname] as const),
      ...accounts.map(row => [row.id, row.displayName] as const)]);
    return rows.map(row => ({ ...row, actorName: names.get(row.actorId) ?? '历史管理员' }));
  }

  async updateAccountScope(id: string, dataScope: 'EMPLOYEE_STORE' | 'ASSIGNED_STORES' | 'ALL_STORES', storeIds: string[], actorId: string) {
    const requested = [...new Set(storeIds)].sort();
    if (dataScope !== 'ASSIGNED_STORES' && requested.length)
      throw new BadRequestException('仅指定门店模式可选择门店');
    return this.prisma.$transaction(async tx => {
      const account = await tx.v2Account.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, displayName: true, dataScope: true, storeScopes: { select: { storeId: true } } }
      });
      if (!account) throw new NotFoundException('账号不存在');
      const before = { dataScope: account.dataScope, storeIds: account.storeScopes.map(row => row.storeId).sort() };
      const after = { dataScope, storeIds: requested };
      if (JSON.stringify(before) === JSON.stringify(after)) return after;
      const existingIds = new Set(before.storeIds);
      const newIds = requested.filter(storeId => !existingIds.has(storeId));
      if (newIds.length && await tx.v2Store.count({
        where: { id: { in: newIds }, deletedAt: null, status: { not: 'CLOSED' } }
      }) !== newIds.length) throw new BadRequestException('包含不可新增授权的门店');
      await tx.v2Account.update({ where: { id }, data: { dataScope, updatedBy: actorId } });
      await tx.v2AccountStoreScope.deleteMany({ where: { accountId: id, storeId: requested.length ? { notIn: requested } : undefined } });
      if (newIds.length) await tx.v2AccountStoreScope.createMany({
        data: newIds.map(storeId => ({ accountId: id, storeId, createdBy: actorId }))
      });
      await tx.v2AuthorizationAudit.create({
        data: { subject: 'ACCOUNT_SCOPE', subjectId: id, subjectName: account.displayName, actorId, before, after }
      });
      return after;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async createAccount(dto: CreateV2AccountDto, user: CurrentUser) {
    const { password, roleIds = [], storeIds = [], ...account } = dto;
    const passwordHash = await bcrypt.hash(password, 12);
    return this.prisma.$transaction(async tx => {
      const created = await tx.v2Account.create({
      data: {
        ...account,
        passwordHash,
        mustChangePassword: true,
        createdBy: user.id,
        updatedBy: user.id,
        roles: {
          create: roleIds.map((roleId) => ({ roleId, createdBy: user.id }))
        },
        storeScopes: {
          create: storeIds.map((storeId) => ({ storeId, createdBy: user.id }))
        }
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        status: true,
        dataScope: true
      }
      });
      await tx.v2AuthorizationAudit.create({
        data: { subject: 'ACCOUNT_SCOPE', subjectId: created.id, subjectName: created.displayName,
          actorId: user.id, after: { dataScope: created.dataScope, storeIds: [...new Set(storeIds)].sort() } }
      });
      return created;
    });
  }

  private async nextCode(key: string, prefix: string) {
    const sequence = await this.prisma.v2SystemSequence.upsert({
      where: { key },
      create: { key, currentValue: 1 },
      update: { currentValue: { increment: 1 } }
    });
    return `${prefix}-${String(sequence.currentValue).padStart(4, '0')}`;
  }

  private assertStoreAccess(user: CurrentUser, storeId: string) {
    if (
      !user.roles.includes('super_admin') &&
      !user.accessibleStoreIds.includes(storeId)
    )
      throw new ForbiddenException('无权维护该门店数据');
  }

  private async assertEmployeeAccess(user: CurrentUser, employeeId: string) {
    if (user.roles.includes('super_admin')) return;
    const count = await this.prisma.v2Employment.count({
      where: {
        employeeId,
        storeId: { in: user.accessibleStoreIds },
        endedOn: null,
        deletedAt: null
      }
    });
    if (!count) throw new ForbiddenException('无权维护该员工数据');
  }
}
