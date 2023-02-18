import * as cdk from 'aws-cdk-lib'
import * as route53 from 'aws-cdk-lib/aws-route53'
import { Subdomains } from './Subdomains'

export interface NodesStackProps extends cdk.StackProps {
    project: string
    stage: string
    domain: string
    subdomains: Subdomains
    hostedZone: route53.HostedZone
    nodesIp: string
}