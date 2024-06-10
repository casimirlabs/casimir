import { 
    onMounted,
    onUnmounted,
    ref
} from "vue"


const initializeComposable = ref(false)

// TODO: @ccali11 - create AVS type here
const selectedAVS = ref({})
  
export default function useAVSSelection() {
    const selectAVS = (value: any) => {
        console.log(value)
        selectedAVS.value = value
    }
      
    onMounted(() => {
        // 
    })
    
    onUnmounted(() =>{
        // 
    })

    return {
        selectedAVS: selectedAVS,
        selectAVS
    }
}