#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DifyOnAwsStack } from '../lib/dify-on-aws-stack';
import { UsEast1Stack } from '../lib/us-east-1-stack';
import { EnvironmentProps } from '../lib/environment-props';

// 環境変数からIPアドレス範囲を取得し、配列に変換する関数
const getAllowedIpRanges = (envVar: string | undefined): string[] => {
  if (!envVar) return [];
  return envVar.split(',').map(ip => ip.trim()).filter(ip => ip !== '');
};

export const props: EnvironmentProps = {
  awsRegion: 'ap-northeast-1',
  awsAccount: process.env.CDK_DEFAULT_ACCOUNT!,
  // Set Dify version
  difyImageTag: '1.1.3',
  // Set plugin-daemon version to stable release
  difyPluginDaemonImageTag: '0.0.6-local',

  // uncomment the below options for less expensive configuration:
  // isRedisMultiAz: false,
  // useNatInstance: true,
  // enableAuroraScalesToZero: true,
  // useFargateSpot: true,

  // CloudFrontを使用する
  useCloudFront: true,
  // 環境変数ALLOWED_IPV4_CIDRSから許可IPアドレスを取得
  // 例: ALLOWED_IPV4_CIDRS="192.168.1.1/32,192.168.1.2/32"
  allowedIPv4Cidrs: getAllowedIpRanges(process.env.ALLOWED_IPV4_CIDRS),
  // 必要に応じてIPv6も同様に設定可能
  allowedIPv6Cidrs: getAllowedIpRanges(process.env.ALLOWED_IPV6_CIDRS),

  // Notion認証情報を環境変数から設定（環境変数が存在する場合のみ）
  additionalEnvironmentVariables: [
    ...(process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET ? [
      {
        key: 'NOTION_INTEGRATION_TYPE',
        value: 'public',
        targets: ['api', 'worker']
      },
      {
        key: 'NOTION_CLIENT_ID',
        value: process.env.NOTION_CLIENT_ID,
        targets: ['api', 'worker']
      },
      {
        key: 'NOTION_CLIENT_SECRET',
        value: process.env.NOTION_CLIENT_SECRET,
        targets: ['api', 'worker']
      }
    ] : []),
    ...(process.env.NOTION_INTERNAL_SECRET ? [
      {
        key: 'NOTION_INTEGRATION_TYPE',
        value: 'internal',
        targets: ['api', 'worker']
      },
      {
        key: 'NOTION_INTERNAL_SECRET',
        value: process.env.NOTION_INTERNAL_SECRET,
        targets: ['api', 'worker']
      }
    ] : [])
  ],

  // Please see EnvironmentProps in lib/environment-props.ts for all the available properties
};

const app = new cdk.App();

let virginia: UsEast1Stack | undefined = undefined;
if ((props.useCloudFront ?? true) && (props.domainName || props.allowedIPv4Cidrs || props.allowedIPv6Cidrs)) {
  // DifyのリージョンでWAFを作成するように変更
  virginia = new UsEast1Stack(app, `DifyOnAwsUsEast1Stack${props.subDomain ? `-${props.subDomain}` : ''}`, {
    env: { region: 'us-east-1', account: props.awsAccount },
    crossRegionReferences: true,
    domainName: props.domainName,
    allowedIpV4AddressRanges: props.allowedIPv4Cidrs,
    allowedIpV6AddressRanges: props.allowedIPv6Cidrs,
  });
}

new DifyOnAwsStack(app, 'DifyOnAwsStack', {
  env: { region: props.awsRegion, account: props.awsAccount },
  crossRegionReferences: true,
  ...props,
  cloudFrontCertificate: virginia?.certificate,
  cloudFrontWebAclArn: virginia?.webAclArn,
});
