import { Construct } from 'constructs'
import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as glue from '@aws-cdk/aws-glue-alpha'
import { Schema, eventSchema, walletSchema, stakingActionSchema } from '@casimir/data'
import { kebabCase, pascalCase, snakeCase } from '@casimir/helpers'
import { Config } from './config'
import { AnalyticsStackProps } from '../interfaces/StackProps'

/**
 * Chain analytics stack
 */
export class AnalyticsStack extends cdk.Stack {
    /** Stack name */
    public readonly name = pascalCase('analytics')

    constructor(scope: Construct, id: string, props: AnalyticsStackProps) {
        super(scope, id, props)

        const config = new Config()

        /** Get Glue Columns from JSON Schema for each table */
        const eventColumns = new Schema(eventSchema).getGlueColumns()
        const walletColumns = new Schema(walletSchema).getGlueColumns()
        const stakingActionColumns = new Schema(stakingActionSchema).getGlueColumns()

        /** Create Glue DB */
        const database = new glue.Database(this, config.getFullStackResourceName(this.name, 'database'), {
            databaseName: snakeCase(config.getFullStackResourceName(this.name, 'database'))
        })

        /** Create S3 buckets */
        const eventBucket = new s3.Bucket(this, config.getFullStackResourceName(this.name, 'event-bucket', config.dataVersion), {
            bucketName: kebabCase(config.getFullStackResourceName(this.name, 'event-bucket', config.dataVersion)),
        })
        const walletBucket = new s3.Bucket(this, config.getFullStackResourceName(this.name, 'wallet-bucket', config.dataVersion), {
            bucketName: kebabCase(config.getFullStackResourceName(this.name, 'wallet-bucket', config.dataVersion)),
        })
        const stakingActionBucket = new s3.Bucket(this, config.getFullStackResourceName(this.name, 'staking-action-bucket', config.dataVersion), {
            bucketName: kebabCase(config.getFullStackResourceName(this.name, 'staking-action-bucket', config.dataVersion)),
        })
        new s3.Bucket(this, config.getFullStackResourceName(this.name, 'output-bucket', config.dataVersion))

        /** Create Glue tables */
        new glue.Table(this, config.getFullStackResourceName(this.name, 'event-table', config.dataVersion), {
            database: database,
            tableName: snakeCase(config.getFullStackResourceName(this.name, 'event-table', config.dataVersion)),
            bucket: eventBucket,
            columns: eventColumns,
            dataFormat: glue.DataFormat.JSON,
        })
        new glue.Table(this, config.getFullStackResourceName(this.name, 'wallet-table', config.dataVersion), {
            database: database,
            tableName: snakeCase(config.getFullStackResourceName(this.name, 'wallet-table', config.dataVersion)),
            bucket: walletBucket,
            columns: walletColumns,
            dataFormat: glue.DataFormat.JSON,
        })
        new glue.Table(this, config.getFullStackResourceName(this.name, 'staking-action-table', config.dataVersion), {
            database: database,
            tableName: snakeCase(config.getFullStackResourceName(this.name, 'staking-action-table', config.dataVersion)),
            bucket: stakingActionBucket,
            columns: stakingActionColumns,
            dataFormat: glue.DataFormat.JSON,
        })
    }
}