<script setup>
import {
    AdjustmentsVerticalIcon,
    ChevronDoubleLeftIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronDoubleRightIcon,
    MagnifyingGlassIcon,
    ArrowLongUpIcon,
    ArrowLongDownIcon
} from "@heroicons/vue/24/outline"
import { ref, computed, onMounted, watch } from "vue"
import {
    TransitionRoot,
    TransitionChild,
    Dialog,
    DialogPanel,
    Switch
} from "@headlessui/vue"
// import useFormat from "@/composables/services/format"
// import useUser from "@/composables/services/user"
import useAVSSelection from "@/composables/state/avsSelection"
import { useStorage } from "@vueuse/core"
import StakeCard from "./StakeCard.vue"

const { selectedAVS, selectAVS } = useAVSSelection()
// const { user } = useUser()
// const { convertString, formatEthersCasimir, formatDecimalString } = useFormat()

// TODO: @ccali11 - change value attribute if needed once we get the payload and know what the values are called
// TODO: @ccali11 - pull images of each AVS and Operator (look for API for this)
const columns = [
    { title: "AVS", show: ref(true), value: "AVSName" }, 
    { title: "Token", show: ref(true), value: "AVSToken" }, 
    { title: "ETH Restaked", show: ref(true), value: "TotalETHRestaked" }, 
    { title: "Eigen Restaked", show: ref(true), value: "TotalEigenRestaked" }, 
    { title: "Stakers", show: ref(true), value: "TotalStakersAmount" },
    { title: "Operator", show: ref(true), value: "OperatorName" },  // we might need a image and name here?
    { title: "Restake Concentration", show: ref(false), value: "OperatorRestakeConcentration" },
    { title: "Status", show: ref(true), value: "OperatorStatus" },  // active or inactive
]

const tableHeaders = ref(columns)
useStorage("chosenAVSDirectStakeTableHeaders", tableHeaders.value)


const toggleColumnShowItem = (item) =>{
    const index = columns.findIndex((col) => col === item)

    if (index > -1) {
        columns[index].show = ref(!item.show.value)
        tableHeaders.value = columns
    } else return
    
    tableHeaders.value = columns.map((col) => ({
        title: col.title,
        show: ref(col.show.value),
        value: col.value
    }))  
}


const openColumnsConfigurations = ref(false)


const closeColumnsConfigurationsModal = () => {
    openColumnsConfigurations.value = false
}
const  openColumnsConfigurationsModal = () => {
    openColumnsConfigurations.value = true
}

const stakeWithAVSModal = ref(false)

const closeStakeWithAVSModal = () => {
    stakeWithAVSModal.value = false
}
const  openStakeWithAVSModal = () => {
    stakeWithAVSModal.value = true
}


const currentPage = ref(1)
const itemsPerPage = ref(9)
const pagesAvailable = computed(() => {
    // add filtering method here too
    return Math.ceil(AVSData?.value?.length / itemsPerPage.value)
})

const goToStartPage = () => {
    currentPage.value = 1
}
const goToPreviousPage = () => {
    if (currentPage.value > 1) {
        currentPage.value --
    }
}
const goToNextPage = () => {
    if (currentPage.value < pagesAvailable.value) {
        currentPage.value ++
    }
}
const goToLastPage = () => {
    currentPage.value = pagesAvailable.value
}

const sortedItem = ref(null) // name (value) of header to be sorted
const sortedDirection = ref(null) // ascending or descending

const findSwitchHeaderValue = (switchItem) => {
    const index = tableHeaders.value.findIndex(item => item.title == switchItem.title)
    return tableHeaders.value[index].show
}

const searchInputValue = ref(null)
watch(searchInputValue, () =>{
    console.log("Filter through the AVS Here")
})

// TODO: @ccali11 - Replace this with the actual AVS data
const AVSData = ref(null)
const filteredAVS = computed(() =>{
    const data = sortAVSData()
    return data?.slice((currentPage.value - 1) * itemsPerPage.value, currentPage.value * itemsPerPage.value)
})

const sortAVSData = () => {
    let data = AVSData.value || []

    if (searchInputValue.value) {

        const searchTerm = searchInputValue?.value?.toLowerCase()
        data = data.filter(item =>
            Object.values(item).some(value =>
                value.toString().toLowerCase().includes(searchTerm)
            )
        )
    }

    if (sortedItem.value && sortedDirection.value) {
        data = [...data].sort(compareValues(sortedItem.value, sortedDirection.value))
    }

    return data
}

const compareValues = (key, order = "ascending") => {
    return function(a, b) {
        // eslint-disable-next-line no-prototype-builtins
        if (!a.hasOwnProperty(key) || !b.hasOwnProperty(key)) {
            // Property doesn't exist on either object
            return 0
        }

        const varA = (typeof a[key] === "string")
            ? a[key].toUpperCase() : a[key]
        const varB = (typeof b[key] === "string")
            ? b[key].toUpperCase() : b[key]

        let comparison = 0
        if (varA > varB) {
            comparison = 1
        } else if (varA < varB) {
            comparison = -1
        }
        return (
            (order === "descending") ? (comparison * -1) : comparison
        )
    }
}
// MOCK DATA GEN HERE
const getRandomValue = (column) => {
    switch (column.value) {
    case "AVSName":
        return `AVS ${Math.floor(Math.random() * 100)}`
    case "AVSToken":
        return `Token ${Math.floor(Math.random() * 1000)}`
    case "TotalETHRestaked":
        return (Math.random() * 100).toFixed(2)
    case "TotalEigenRestaked":
        return (Math.random() * 50).toFixed(2)
    case "TotalStakersAmount":
        return Math.floor(Math.random() * 1000)
    case "OperatorName":
        return `Operator ${Math.floor(Math.random() * 100)}`
    case "OperatorRestakeConcentration":
        return (Math.random() * 100).toFixed(2) + "%"
    case "OperatorStatus":
        return Math.random() > 0.5 ? "active" : "inactive"
    default:
        return "N/A"
    }
}

// TODO: @ccali11 - Find out where to pull AVS data from and implement it in a composable file
const generateMockedItems = (columns, numItems = 10) => {
    const items = []

    for (let i = 0; i < numItems; i++) {
        const item = {}

        columns.forEach(column => {
            item[column.value] = getRandomValue(column)
        })

        items.push(item)
    }

    return items
}

onMounted(() => {
    AVSData.value = generateMockedItems(columns, 100)
})

</script>

<template>
  <div class="card w-full h-full shadow p-[24px] flex flex-col items-start justify-between gap-[24px]">
    <div class="w-full flex items-center justify-between flex-wrap gap-[12px]">
      <div class="flex items-center gap-[8px] min-w-[210px]">
        <div>
          <h1 class="card_title">
            AVS Direct Stake
          </h1>
        
          <p class="card_subtitle">
            Stake directly to an AVS of your choice
          </p>
        </div>
      </div>
      <div class="flex items-center gap-[12px] 900s:w-full">
        <div
          class="w-full rounded-[6px] flex items-center 
          justify-between input_container_border min-w-[300px] gap-[12px] p-0 shadow-md"
        >
          <input 
            v-model="searchInputValue"
            type="text"
            placeholder="Search"
            class="flex items-center text-[14.22px] justify-between gap-[8px] w-full h-full outline-none bg-transparent
            text-black dark:text-white px-[6px]"
          >
          <button
            class="rounded-r-[6px] px-[12px] py-[6px] flex items-center justify-center gap-[8px]
            bg-gray_4 text-black dark:bg-gray_5 dark:text-white
            hover:bg-gray_4/60 active:bg-gray_4/80 dark:hover:bg-gray_5/60
            dark:active:bg-gray_5/80;
            border-l border-l-lightBorder dark:border-l-darkBorder"
          >
            <MagnifyingGlassIcon class="w-[20px] h-[20px]" />
          </button>
        </div>
        <button
          class="secondary_btn shadow-none"
          @click="openColumnsConfigurationsModal()"
        >
          <AdjustmentsVerticalIcon class="w-[20px] h-[20px]" />
        </button>
      </div>
    </div>
    <div class="w-full h-full">
      <div class="w-full border border-lightBorder dark:border-darkBorder rounded-[6px] overflow-x-auto">
        <table class="w-full overflow-x-auto">
          <thead>
            <tr class="border-b border-b-lightBorder dark:border-b-darkBorder">
              <th
                v-for="item in tableHeaders"
                v-show="item.show"
                :key="item.value"
                class="py-[8px] text-left px-[8px] whitespace-nowrap"
              >
                <small class="font-[300]">
                  {{ item.title }}
                </small>
              </th>
            </tr>
          </thead>
          <tbody
            class="w-full"
          >
            <tr
              v-for="AVS in filteredAVS"
              :key="AVS"
              class="hover:bg-gray_4 dark:hover:bg-gray_6 cursor-pointer whitespace-nowrap"
              @click="openStakeWithAVSModal(), selectAVS(AVS)"
            >
              <td
                v-for="(item, index) in tableHeaders"
                v-show="item.show"
                :key="index"
                class="border-b py-[8px] border-b-lightBorder dark:border-b-darkBorder"
              >
                <!-- TODO: style out each table item -->
                <!--  <div
                  v-if="item.value === 'address'"
                  class="px-[8px] flex items-center gap-[12px]"
                >
                </div> -->
  
                <div 
                  class="px-[8px] flex items-center gap-[12px]"
                >
                  <small>
                    {{ AVS[item.value] }}
                  </small>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>


    <div
      class="flex items-center justify-between gap-[15px] w-full px-[8px]"
    >
      <div class="text-[#71717a] text-[12px] font-[400]">
        Page {{ currentPage }} of {{ pagesAvailable }}
      </div>
      <div class="flex items-center gap-[5px] text-[#71717a]">
        <button
          class="border border-[#e4e4e7] rounded-[6px] p-[4px] 
            hover:bg-[#F4F4F5] cursor-pointer"
          @click="goToStartPage()"
        >
          <ChevronDoubleLeftIcon class="h-[14px] w-[14px]" />
        </button>
        <button
          class="border border-[#e4e4e7] rounded-[6px] p-[4px] 
            hover:bg-[#F4F4F5] cursor-pointer"
          @click="goToPreviousPage()"
        >
          <ChevronLeftIcon class="h-[14px] w-[14px]" />
        </button>
        <button
          class="border border-[#e4e4e7] rounded-[6px] p-[4px] 
            hover:bg-[#F4F4F5] cursor-pointer"
          @click="goToNextPage()"
        >
          <ChevronRightIcon class="h-[14px] w-[14px]" />
        </button>
        <button
          class="border border-[#e4e4e7] rounded-[6px] p-[4px] 
            hover:bg-[#F4F4F5] cursor-pointer"
          @click="goToLastPage()"
        >
          <ChevronDoubleRightIcon class="h-[14px] w-[14px]" />
        </button>
      </div>
    </div>


    <!-- Table Configurations -->
    <TransitionRoot
      appear
      :show="openColumnsConfigurations"
      as="template"
    >
      <Dialog
        as="div"
        class="relative z-10"
        @close="closeColumnsConfigurationsModal"
      >
        <TransitionChild
          as="template"
          enter="duration-300 ease-out"
          enter-from="opacity-0"
          enter-to="opacity-100"
          leave="duration-200 ease-in"
          leave-from="opacity-100"
          leave-to="opacity-0"
        >
          <div class="fixed inset-0 bg-black/25" />
        </TransitionChild>

        <div class="fixed inset-0 overflow-y-auto">
          <div
            class="flex min-h-full items-center justify-center p-4 text-center"
          >
            <TransitionChild
              as="template"
              enter="duration-300 ease-out"
              enter-from="opacity-0 scale-95"
              enter-to="opacity-100 scale-100"
              leave="duration-200 ease-in"
              leave-from="opacity-100 scale-100"
              leave-to="opacity-0 scale-95"
            >
              <DialogPanel
                class="card w-full max-w-[360px] p-[24px]"
              >
                <div class="text-left pb-[24px] border-b border-b-lightBorder dark:border-b-darkBorder">
                  <h1 class="card_title">
                    Configure Columns
                  </h1>
                  <p class="card_subtitle">
                    Change the layout of the transaction list and display only the columns and information that is most important to you.
                  </p>
                </div>

                <div class="mt-4">
                  <div
                    v-for="(item, index) in columns"
                    :key="index"
                    class="w-full flex items-center justify-between mt-[10px] text-[14px] font-[500] tracking-[0.15px] text-[#71717a] text-left"
                  >
                    {{ item.title }}

                    
                    <div class="flex items-center gap-[12px] text-[12px]">
                      <div class="flex items-center gap-[6px]">
                        <button
                          class="secondary_btn hover:outline outline-[0.5px] outline-lightBorder dark:outline-darkBorder"
                          style="gap: 0px; box-shadow: none; font-weight: 800; padding: 4px 6px;"
                          :style="sortedItem === item.value && sortedDirection === 'ascending'? 'background: black; color: white;' : ''"
                          @click="sortedItem = item.value, sortedDirection = 'ascending'"
                        >
                          A
                          <div class="w-[14px] h-[14px]">
                            <ArrowLongUpIcon />
                          </div>
                        </button>
                        <button
                          class="secondary_btn hover:outline outline-[0.5px] outline-lightBorder dark:outline-darkBorder"
                          style="gap: 0px; box-shadow: none; font-weight: 800; padding: 4px 6px;"
                          :style="sortedItem === item.value && sortedDirection === 'descending'? 'background: black; color: white;' : ''"
                          @click="sortedItem = item.value, sortedDirection = 'descending'"
                        >
                          a
                          <div class="w-[14px] h-[14px]">
                            <ArrowLongDownIcon />
                          </div>
                        </button>
                      </div>
                      <Switch
                        :class="findSwitchHeaderValue(item)? 'bg-black dark:bg-white' : ' bg-gray_1 dark:bg-gray_6'"
                        class="switch_container"
                        @click="toggleColumnShowItem(item)"
                      >
                        <span class="sr-only">Use setting</span>
                        <span
                          aria-hidden="true"
                          :class="columns[index].show.value ? 'translate-x-4' : 'translate-x-0'"
                          class="switch_ball"
                        />
                      </Switch>
                    </div>
                  </div>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </TransitionRoot>

    <!-- Stake Modal-->
    <TransitionRoot
      appear
      :show="stakeWithAVSModal && selectedAVS !== null"
      as="template"
    >
      <Dialog
        as="div"
        class="relative z-10"
        @close="closeStakeWithAVSModal"
      >
        <TransitionChild
          as="template"
          enter="duration-300 ease-out"
          enter-from="opacity-0"
          enter-to="opacity-100"
          leave="duration-200 ease-in"
          leave-from="opacity-100"
          leave-to="opacity-0"
        >
          <div class="fixed inset-0 bg-black/25" />
        </TransitionChild>

        <div class="fixed inset-0 overflow-y-auto">
          <div
            class="flex min-h-full items-center justify-center p-4 text-center"
          >
            <TransitionChild
              as="template"
              enter="duration-300 ease-out"
              enter-from="opacity-0 scale-95"
              enter-to="opacity-100 scale-100"
              leave="duration-200 ease-in"
              leave-from="opacity-100 scale-100"
              leave-to="opacity-0 scale-95"
            >
              <DialogPanel
                v-show="selectedAVS !== null"
                class="card w-full max-w-[360px] p-[24px]"
              >
                <StakeCard />
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </TransitionRoot>
  </div>
</template>

<style>
</style>