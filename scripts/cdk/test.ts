import { $, echo } from 'zx'

/**
 * Test a CDK app built for a CF cluster
 * 
 * Further information:
 * See https://docs.aws.amazon.com/cdk/api/v2
 */
void async function () {
    /** Configure the environment with fallback default values */
    process.env.PROJECT = process.env.PROJECT || 'casimir'
    process.env.STAGE = process.env.STAGE || 'test'
    process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1'
    process.env.AWS_ACCOUNT = process.env.AWS_ACCOUNT || '000000000000'
    process.env.NODES_IP = process.env.NODES_IP || '123.456.789.012'

    /** Prepare CDK resources */
    await $`npm run build --workspace @casimir/landing`
    await $`npm run build --workspace @casimir/users`

    /** Test CDK app */
    echo('🚀 Testing CDK app')
    $`npm run test --workspace @casimir/cdk`
}()